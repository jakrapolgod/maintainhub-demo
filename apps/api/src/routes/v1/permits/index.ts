/**
 * Permit-to-Work (PTW) routes.
 *
 * State machine enforced server-side:
 *   DRAFT → SUBMITTED → APPROVED → ACTIVE → CLOSED
 *                    ↘ REJECTED (from SUBMITTED or APPROVED)
 *
 * POST   /permits                      — create a PTW for a work order
 * GET    /permits/:id                  — fetch PTW detail
 * POST   /permits/:id/submit           — DRAFT → SUBMITTED
 * POST   /permits/:id/approve          — SUBMITTED → APPROVED (with signature)
 * POST   /permits/:id/reject           — SUBMITTED|APPROVED → REJECTED
 * POST   /permits/:id/activate         — APPROVED → ACTIVE
 * POST   /permits/:id/close            — ACTIVE → CLOSED
 * POST   /permits/ai/risk-assess       — stream AI risk assessment fields (OpenRouter SSE)
 */
import type { ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { DomainException } from '../../../errors/domain.exception.js'
import { AI_MODEL, AI_MAX_TOKENS } from '../../../application/work-orders/ai/index.js'
import type { OASSchema } from '../work-orders/route-helpers.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sseHeaders(raw: ServerResponse): void {
  raw.setHeader('Content-Type', 'text/event-stream')
  raw.setHeader('Cache-Control', 'no-cache, no-transform')
  raw.setHeader('Connection', 'keep-alive')
  raw.setHeader('X-Accel-Buffering', 'no')
  raw.flushHeaders()
}

function writeSse(raw: ServerResponse, data: unknown): boolean {
  return raw.write(`data: ${JSON.stringify(data)}\n\n`)
}

function permitNumber(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const seq = createHash('sha256')
    .update(String(Date.now()))
    .digest('hex')
    .slice(0, 6)
    .toUpperCase()
  return `PTW-${yy}${mm}-${seq}`
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPTWSchema = z.object({
  workOrderId: z.string().cuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  hazards: z.array(z.string()).default([]),
  precautions: z.array(z.string()).default([]),
  requiredPPE: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
  siteId: z.string().cuid().optional(),
})

const approveSchema = z.object({
  approverSignature: z.string().min(1, 'Signature is required'),
})

const rejectSchema = z.object({
  reason: z.string().min(5).max(500),
})

const riskAssessSchema = z.object({
  workOrderId: z.string().cuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  assetName: z.string().optional(),
  assetCategory: z.string().optional(),
  location: z.string().optional(),
})

const AI_PTW_PROMPT = `You are a certified health & safety officer and risk assessment specialist.

Given the work order details below, generate a structured Permit-to-Work risk assessment.

Respond with a valid JSON object ONLY — no markdown, no prose before/after:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "hazards": string[],
  "precautions": string[],
  "requiredPPE": string[],
  "isolationPoints": string[],
  "rescueProcedure": string,
  "estimatedDurationHours": number
}

Be specific and practical. Base hazards and precautions on the actual work type, not generic advice.`

// ── Plugin ────────────────────────────────────────────────────────────────────

const permitRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /permits/ai/risk-assess ───────────────────────────────────────────
  // Static path — must be registered before dynamic /:id routes.
  fastify.post(
    '/ai/risk-assess',
    {
      schema: {
        description: 'Stream an AI-generated PTW risk assessment via SSE (OpenRouter).',
        tags: ['permits'],
        security: [{ bearerAuth: [] }],
      } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      if (!request.server.ai) {
        throw new DomainException('AI service not configured', 'AI_UNAVAILABLE', 503)
      }

      const body = riskAssessSchema.parse(request.body)

      const lines = [
        `Work order: "${body.title}"`,
        body.description ? `Description: ${body.description}` : '',
        body.assetName ? `Asset: ${body.assetName}` : '',
        body.assetCategory ? `Asset category: ${body.assetCategory}` : '',
        body.location ? `Location: ${body.location}` : '',
      ].filter(Boolean)

      reply.hijack()
      const { raw } = reply
      sseHeaders(raw)

      try {
        const stream = await request.server.ai.chat.completions.create({
          model: AI_MODEL,
          max_tokens: AI_MAX_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: 'system', content: AI_PTW_PROMPT },
            { role: 'user', content: lines.join('\n') },
          ],
        })

        let inputTokens = 0
        let outputTokens = 0

        for await (const chunk of stream) {
          if (raw.destroyed) break
          const text = chunk.choices[0]?.delta?.content
          if (text) writeSse(raw, { type: 'delta', text })
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens
            outputTokens = chunk.usage.completion_tokens
          }
        }

        writeSse(raw, { type: 'done', usage: { inputTokens, outputTokens } })
      } catch (err) {
        if (!raw.destroyed) {
          writeSse(raw, {
            type: 'error',
            code: 'AI_API_ERROR',
            message: err instanceof Error ? err.message : 'Stream interrupted',
          })
        }
      } finally {
        if (!raw.destroyed) raw.end()
      }
    },
  )

  // ── POST /permits ──────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a Permit-to-Work for a work order.',
        tags: ['permits'],
        security: [{ bearerAuth: [] }],
      } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const body = createPTWSchema.parse(request.body)

      // Verify the WO belongs to this tenant
      const wo = await request.db.workOrder.findFirst({
        where: { id: body.workOrderId, deletedAt: null },
        select: { id: true, title: true },
      })
      if (!wo) throw new DomainException('Work order not found', 'NOT_FOUND', 404)

      // Ensure only one PTW per WO
      const existing = await request.db.permitToWork.findFirst({
        where: { workOrderId: body.workOrderId },
        select: { id: true },
      })
      if (existing) {
        throw new DomainException('PTW already exists for this work order', 'PTW_EXISTS', 409)
      }

      const ptw = await request.db.permitToWork.create({
        data: {
          tenantId: request.user.tid,
          workOrderId: body.workOrderId,
          permitNumber: permitNumber(),
          status: 'DRAFT',
          title: body.title,
          ...(body.description !== undefined && { description: body.description }),
          riskLevel: body.riskLevel,
          hazards: body.hazards,
          precautions: body.precautions,
          requiredPPE: body.requiredPPE,
          ...(body.siteId !== undefined && { siteId: body.siteId }),
          ...(body.expiresAt !== undefined && { expiresAt: new Date(body.expiresAt) }),
          createdById: request.user.sub,
        },
      })

      return reply.status(201).send(ptw)
    },
  )

  // ── GET /permits/:id ───────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const ptw = await request.db.permitToWork.findFirst({
        where: { id: request.params.id },
      })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      return reply.send(ptw)
    },
  )

  // ── POST /permits/:id/submit ───────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/submit',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const ptw = await request.db.permitToWork.findFirst({ where: { id: request.params.id } })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      if (ptw.status !== 'DRAFT') {
        throw new DomainException(
          `Cannot submit a permit in ${ptw.status} state`,
          'INVALID_PTW_TRANSITION',
          422,
        )
      }

      const updated = await request.db.permitToWork.update({
        where: { id: ptw.id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: request.user.sub },
      })
      return reply.send(updated)
    },
  )

  // ── POST /permits/:id/approve ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/approve',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const body = approveSchema.parse(request.body)

      const ptw = await request.db.permitToWork.findFirst({ where: { id: request.params.id } })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      if (ptw.status !== 'SUBMITTED') {
        throw new DomainException(
          `Cannot approve a permit in ${ptw.status} state`,
          'INVALID_PTW_TRANSITION',
          422,
        )
      }

      const updated = await request.db.permitToWork.update({
        where: { id: ptw.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: request.user.sub,
          approverSignature: body.approverSignature,
        },
      })
      return reply.send(updated)
    },
  )

  // ── POST /permits/:id/reject ───────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/reject',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const body = rejectSchema.parse(request.body)

      const ptw = await request.db.permitToWork.findFirst({ where: { id: request.params.id } })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      if (ptw.status !== 'SUBMITTED' && ptw.status !== 'APPROVED') {
        throw new DomainException(
          `Cannot reject a permit in ${ptw.status} state`,
          'INVALID_PTW_TRANSITION',
          422,
        )
      }

      const reasonSuffix = `[REJECTED] ${body.reason}`
      const updated = await request.db.permitToWork.update({
        where: { id: ptw.id },
        data: {
          status: 'REJECTED',
          description: ptw.description ? `${ptw.description}\n\n${reasonSuffix}` : reasonSuffix,
        },
      })
      return reply.send(updated)
    },
  )

  // ── POST /permits/:id/activate ─────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/activate',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const ptw = await request.db.permitToWork.findFirst({ where: { id: request.params.id } })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      if (ptw.status !== 'APPROVED') {
        throw new DomainException(
          `Cannot activate a permit in ${ptw.status} state`,
          'INVALID_PTW_TRANSITION',
          422,
        )
      }

      const updated = await request.db.permitToWork.update({
        where: { id: ptw.id },
        data: { status: 'ACTIVE', activatedAt: new Date(), activatedById: request.user.sub },
      })
      return reply.send(updated)
    },
  )

  // ── POST /permits/:id/close ────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/close',
    {
      schema: { tags: ['permits'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      const ptw = await request.db.permitToWork.findFirst({ where: { id: request.params.id } })
      if (!ptw) throw new DomainException('Permit not found', 'NOT_FOUND', 404)
      if (ptw.status !== 'ACTIVE') {
        throw new DomainException(
          `Cannot close a permit in ${ptw.status} state`,
          'INVALID_PTW_TRANSITION',
          422,
        )
      }

      const updated = await request.db.permitToWork.update({
        where: { id: ptw.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: request.user.sub },
      })
      return reply.send(updated)
    },
  )
}

export default permitRoutes
