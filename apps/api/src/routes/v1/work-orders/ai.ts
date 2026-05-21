/**
 * AI-powered work-order routes.
 *
 * POST /ai/draft                    — NL → draft (non-streaming, rate-limited)
 * POST /:id/ai/analyze-failure      — SSE streaming failure analysis
 * POST /:id/ai/generate-instructions — SSE streaming work instructions
 *
 * ## SSE format
 * Every event is a standard text/event-stream line:
 *   data: <JSON>\n\n
 *
 * Event shapes:
 *   { type: 'delta',  text: '...' }              — token chunk
 *   { type: 'done',   usage: { input, output } } — stream complete
 *   { type: 'error',  code: '...', message: '...' } — failure
 *
 * ## Streaming implementation
 * SSE streaming uses `reply.hijack()` + `reply.raw` so Fastify does not
 * attempt its own serialisation after the handler returns.  The Anthropic
 * SDK's `messages.stream()` returns an `AsyncIterable<RawMessageStreamEvent>`.
 *
 * ## Auth
 * - draft: ADMIN, MANAGER, TECHNICIAN (custom preHandler — 'create' permission
 *   excludes TECHNICIAN in the current matrix, so we check manually)
 * - analyze-failure: ADMIN, MANAGER  (requirePermission 'work-order:update')
 * - generate-instructions: all roles (requirePermission 'work-order:read')
 */
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { DomainException } from '../../../errors/domain.exception.js'
import { withTenantFilter } from '../../../lib/tenant-prisma.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  DraftWorkOrderFromNLUseCase,
} from '../../../application/work-orders/ai/index.js'
import { idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const draftBodySchema = z.object({
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(2_000),
  assetId: z.string().cuid().optional(),
})

const analyzeBodySchema = z.object({
  symptomDescription: z.string().trim().min(5, 'Symptom description required').max(2_000)
    .default('No additional symptoms provided — use work order description'),
})

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseHeaders(raw: ServerResponse): void {
  raw.setHeader('Content-Type',      'text/event-stream')
  raw.setHeader('Cache-Control',     'no-cache, no-transform')
  raw.setHeader('Connection',        'keep-alive')
  raw.setHeader('X-Accel-Buffering', 'no')   // prevent nginx buffering
  raw.flushHeaders()
}

function writeSse(raw: ServerResponse, data: unknown): boolean {
  return raw.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ── Per-user rate-limit key (decodes JWT sub without verifying signature) ────

function userRateLimitKey(request: FastifyRequest): string {
  try {
    const auth = request.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ')) return `ai:ip:${request.ip}`
    // Decode payload without signature verification — only used as a bucket key;
    // full JWT verification runs in the preHandler (requirePermission).
    const b64     = auth.slice(7).split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString()) as Record<string, unknown>
    const sub     = typeof payload.sub === 'string' ? payload.sub : request.ip
    return `ai:user:${sub}`
  } catch {
    return `ai:ip:${request.ip}`
  }
}

// ── System prompts (mirrors the non-streaming use case files) ─────────────────

const ANALYZE_FAILURE_PROMPT = `You are an expert maintenance engineer and reliability specialist with deep knowledge of industrial asset failure modes, root cause analysis (RCA), and FMEA.

Analyse the provided symptom description and asset maintenance history to identify probable failure causes and recommended corrective actions.

Respond with a valid JSON object only:
{
  "probableCauses": string[],
  "recommendedActions": string[],
  "suggestedParts": string[],
  "urgency": "IMMEDIATE" | "URGENT" | "ROUTINE" | "MONITOR"
}`

const INSTRUCTIONS_PROMPT = `You are a senior maintenance engineer creating work instructions for a CMMS.

Generate a clear, professional, step-by-step maintenance procedure in Markdown format with these exact sections:

## ⚠️ Safety Warnings
## Required Tools & PPE
## Procedure
## Completion Checklist
## Reference Notes

Be specific, reference manufacturer specs where relevant, and include exact torque values and settings where known.`

// ── Plugin ────────────────────────────────────────────────────────────────────

const aiRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /ai/draft ─────────────────────────────────────────────────────────
  // Static path — must be registered before dynamic /:id routes.
  fastify.post(
    '/ai/draft',
    {
      schema: {
        description: 'Convert a natural-language maintenance request into a structured work-order draft using Claude. Returns draft only — nothing is saved.',
        tags:     ['work-orders', 'ai'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 5, maxLength: 2000, description: 'Plain-language description of the maintenance need' },
            assetId: { type: 'string', description: 'Optional asset CUID for context enrichment' },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: 'object',
            properties: {
              title:              { type: 'string' },
              description:        { type: 'string' },
              type:               { type: 'string' },
              priority:           { type: 'string' },
              suggestedAssignees: { type: 'array', items: { type: 'string' } },
              estimatedHours:     { type: 'number' },
              originalMessage:    { type: 'string' },
              assetId:            { type: 'string' },
            },
          },
          401: { description: 'Unauthorised',   ...errorBody },
          403: { description: 'Forbidden',       ...errorBody },
          422: { description: 'AI error',        ...errorBody },
          503: { description: 'AI unavailable',  ...errorBody },
        },
      } as OASSchema,
      config: {
        rateLimit: {
          max:          20,
          timeWindow:   '1 minute',
          keyGenerator: userRateLimitKey,
        },
      },
      // TECHNICIAN is excluded from 'work-order:create' in the matrix — allow
      // all three roles by verifying JWT + role manually here.
      preHandler: async (request) => {
        await request.jwtVerify()
        request.db = withTenantFilter(request.server.prisma, request.user.tid)
        const { role } = request.user
        if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'TECHNICIAN') {
          throw new DomainException(
            `Forbidden: ${role} cannot use AI draft`,
            'FORBIDDEN',
            403,
          )
        }
      },
    },
    async (request, reply) => {
      if (!request.server.anthropic) {
        throw new DomainException('AI service not configured', 'AI_UNAVAILABLE', 503)
      }

      const body = draftBodySchema.parse(request.body)

      const useCase = new DraftWorkOrderFromNLUseCase(
        request.db,
        request.server.prisma,
        request.server.anthropic,
      )

      try {
        const draft = await useCase.execute({
          userMessage: body.message,
          tenantId:    request.user.tid,
          ...(body.assetId !== undefined && { assetId: body.assetId }),
        })
        return await reply.send(draft)
      } catch (err) {
        if (err instanceof AiError) {
          throw new DomainException(err.message, err.code, err.statusCode)
        }
        throw err
      }
    },
  )

  // ── POST /:id/ai/analyze-failure ───────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/ai/analyze-failure',
    {
      schema: {
        description: 'Stream a failure analysis for a work order via Server-Sent Events. Returns JSON tokens progressively.',
        tags:     ['work-orders', 'ai'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          properties: {
            symptomDescription: { type: 'string', minLength: 5, maxLength: 2000, description: 'Additional symptom context' },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: 'null' },
          401: { description: 'Unauthorised',  ...errorBody },
          403: { description: 'Forbidden',     ...errorBody },
          404: { description: 'WO not found',  ...errorBody },
          503: { description: 'AI unavailable', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      if (!request.server.anthropic) {
        throw new DomainException('AI service not configured', 'AI_UNAVAILABLE', 503)
      }

      const { symptomDescription } = analyzeBodySchema.parse(request.body ?? {})

      // Load WO + asset + maintenance history
      const wo = await request.db.workOrder.findFirst({
        where:  { id: request.params.id, deletedAt: null },
        select: {
          id: true, woNumber: true, title: true, description: true,
          type: true, priority: true, status: true, assetId: true,
          asset: {
            select: {
              name: true, criticality: true, manufacturer: true, model: true,
              description: true,
              category: { select: { name: true } },
              location:  { select: { name: true } },
            },
          },
          failureCode: { select: { code: true, name: true, category: true } },
        },
      })
      if (!wo) {
        throw new DomainException('Work order not found', 'NOT_FOUND', 404)
      }

      const history = await request.server.prisma.workOrder.findMany({
        where:   { tenantId: request.user.tid, assetId: wo.assetId, id: { not: wo.id }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take:    20,
        select: {
          woNumber: true, title: true, type: true, priority: true,
          status: true, resolution: true, completedAt: true,
          failureCode: { select: { code: true, name: true } },
        },
      })

      // Build prompt content
      const lines: string[] = [
        `Symptom description: "${symptomDescription}"`,
        '\n--- Current work order ---',
        `WO: ${wo.woNumber} | Type: ${wo.type} | Priority: ${wo.priority} | Status: ${wo.status}`,
        `Title: ${wo.title}`,
      ]
      if (wo.description) lines.push(`Description: ${wo.description}`)
      if (wo.failureCode) {
        lines.push(`Failure code: ${wo.failureCode.code} — ${wo.failureCode.name} (${wo.failureCode.category})`)
      }
      const a = wo.asset
      lines.push('\n--- Asset information ---')
      lines.push(`Asset: ${a.name} (${a.category.name})`)
      if (a.location) lines.push(`Location: ${a.location.name}`)
      if (a.manufacturer ?? a.model) {
        lines.push(`Equipment: ${[a.manufacturer, a.model].filter(Boolean).join(' ')}`)
      }
      lines.push(`Criticality: ${a.criticality}`)
      if (history.length > 0) {
        lines.push('\n--- Maintenance history (last 20) ---')
        for (const h of history) {
          const date = h.completedAt ? h.completedAt.toISOString().slice(0, 10) : 'open'
          const fc   = h.failureCode ? ` [${h.failureCode.code}]` : ''
          lines.push(`[${date}] ${h.woNumber} ${h.type}/${h.priority}${fc} — ${h.title} (${h.status})`)
          if (h.resolution) lines.push(`  Resolution: ${h.resolution}`)
        }
      } else {
        lines.push('\n--- Maintenance history: none recorded ---')
      }

      // Hijack response for raw SSE
      reply.hijack()
      const { raw } = reply
      sseHeaders(raw)

      const stream = request.server.anthropic.messages.stream({
        model:      AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system:     ANALYZE_FAILURE_PROMPT,
        messages:   [{ role: 'user', content: lines.join('\n') }],
      })

      try {
        for await (const event of stream) {
          if (raw.destroyed) break
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            writeSse(raw, { type: 'delta', text: event.delta.text })
          }
        }
        const final = await stream.finalMessage()
        writeSse(raw, {
          type:  'done',
          usage: {
            inputTokens:  final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
          },
        })
      } catch (err) {
        if (!raw.destroyed) {
          writeSse(raw, {
            type:    'error',
            code:    'AI_API_ERROR',
            message: err instanceof Error ? err.message : 'Stream interrupted',
          })
        }
      } finally {
        if (!raw.destroyed) raw.end()
      }
    },
  )

  // ── POST /:id/ai/generate-instructions ────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/ai/generate-instructions',
    {
      schema: {
        description: 'Stream step-by-step work instructions for a work order via Server-Sent Events. Returns Markdown tokens progressively.',
        tags:     ['work-orders', 'ai'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        response: {
          200: { type: 'null' },
          401: { description: 'Unauthorised',  ...errorBody },
          404: { description: 'WO not found',  ...errorBody },
          503: { description: 'AI unavailable', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      if (!request.server.anthropic) {
        throw new DomainException('AI service not configured', 'AI_UNAVAILABLE', 503)
      }

      // Load WO + asset + PM schedule
      const wo = await request.db.workOrder.findFirst({
        where:  { id: request.params.id, deletedAt: null },
        select: {
          id: true, woNumber: true, title: true, description: true,
          type: true, priority: true, assigneeIds: true,
          asset: {
            select: {
              name: true, criticality: true, manufacturer: true,
              model: true, serialNumber: true, description: true,
              category:    { select: { name: true } },
              location:    { select: { name: true } },
              pmSchedules: {
                where:  { isActive: true },
                take:   1,
                select: { requiredSkills: true, estimatedHours: true },
              },
            },
          },
          failureCode: { select: { code: true, name: true, category: true, notes: true } },
        },
      })
      if (!wo) {
        throw new DomainException('Work order not found', 'NOT_FOUND', 404)
      }

      // Build prompt content
      const a     = wo.asset
      const lines: string[] = [
        'Generate work instructions for the following work order:',
        '',
        `**WO Number:** ${wo.woNumber}`,
        `**Type:** ${wo.type} | **Priority:** ${wo.priority}`,
        `**Title:** ${wo.title}`,
      ]
      if (wo.description) lines.push(`**Description:** ${wo.description}`)
      lines.push('', '**Asset Information:**', `- Name: ${a.name}`, `- Category: ${a.category.name}`)
      if (a.location)   lines.push(`- Location: ${a.location.name}`)
      if (a.manufacturer ?? a.model) {
        lines.push(`- Equipment: ${[a.manufacturer, a.model].filter(Boolean).join(' ')}`)
      }
      if (a.serialNumber) lines.push(`- Serial No: ${a.serialNumber}`)
      lines.push(`- Criticality: ${a.criticality}`)
      if (wo.failureCode) {
        lines.push('', '**Failure Mode:**')
        lines.push(`- Code: ${wo.failureCode.code} — ${wo.failureCode.name} (${wo.failureCode.category})`)
        if (wo.failureCode.notes) lines.push(`- Notes: ${wo.failureCode.notes}`)
      }
      const pm = a.pmSchedules[0]
      if (pm && pm.requiredSkills.length > 0) {
        lines.push('', `**Required Skills:** ${pm.requiredSkills.join(', ')}`)
      }
      if (wo.assigneeIds.length > 1) {
        lines.push(`**Team size:** ${wo.assigneeIds.length} technicians assigned`)
      }

      // Hijack response for raw SSE
      reply.hijack()
      const { raw } = reply
      sseHeaders(raw)

      const stream = request.server.anthropic.messages.stream({
        model:      AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system:     INSTRUCTIONS_PROMPT,
        messages:   [{ role: 'user', content: lines.join('\n') }],
      })

      try {
        for await (const event of stream) {
          if (raw.destroyed) break
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            writeSse(raw, { type: 'delta', text: event.delta.text })
          }
        }
        const final = await stream.finalMessage()
        writeSse(raw, {
          type:  'done',
          usage: {
            inputTokens:  final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
          },
        })
      } catch (err) {
        if (!raw.destroyed) {
          writeSse(raw, {
            type:    'error',
            code:    'AI_API_ERROR',
            message: err instanceof Error ? err.message : 'Stream interrupted',
          })
        }
      } finally {
        if (!raw.destroyed) raw.end()
      }
    },
  )
}

export default aiRoutes
