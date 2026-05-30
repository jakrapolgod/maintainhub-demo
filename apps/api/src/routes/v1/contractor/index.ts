/**
 * Contractor portal routes.
 *
 * POST /contractor/tokens                 — generate a scoped access token (MANAGER/ADMIN)
 * DELETE /contractor/tokens/:id           — revoke a token
 * GET  /contractor/portal/auth            — exchange ?token=<opaque> → session info
 * GET  /contractor/portal/work-orders     — list WOs the contractor can see (token-auth)
 *
 * Security model:
 *   • The opaque token is a 32-byte random hex string — never stored in DB.
 *   • Only the SHA-256 hash is stored (ContractorToken.tokenHash).
 *   • Portal auth: the client sends the opaque token; we hash it and look it up.
 *   • WO access is scoped to ContractorToken.workOrderIds — no other WOs are visible.
 */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { DomainException } from '../../../errors/domain.exception.js'
import type { OASSchema } from '../work-orders/route-helpers.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const createTokenSchema = z.object({
  contractorName: z.string().min(2).max(100),
  contractorEmail: z.string().email().optional(),
  workOrderIds: z.array(z.string().cuid()).min(1),
  expiresInHours: z.number().int().min(1).max(168).default(24),
})

const contractorRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /contractor/tokens ────────────────────────────────────────────────
  fastify.post(
    '/tokens',
    {
      schema: {
        description:
          'Generate a time-limited contractor access token scoped to specific work orders.',
        tags: ['contractor'],
        security: [{ bearerAuth: [] }],
      } as OASSchema,
      preHandler: requirePermission('work-order', 'assign'),
    },
    async (request, reply) => {
      const body = createTokenSchema.parse(request.body)

      // Verify all WOs belong to this tenant
      const wos = await request.db.workOrder.findMany({
        where: { id: { in: body.workOrderIds }, deletedAt: null },
        select: { id: true },
      })
      if (wos.length !== body.workOrderIds.length) {
        throw new DomainException('One or more work orders not found', 'NOT_FOUND', 404)
      }

      const opaqueToken = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + body.expiresInHours * 3_600_000)

      const record = await request.server.prisma.contractorToken.create({
        data: {
          tenantId: request.user.tid,
          tokenHash: hashToken(opaqueToken),
          contractorName: body.contractorName,
          ...(body.contractorEmail !== undefined && { contractorEmail: body.contractorEmail }),
          workOrderIds: body.workOrderIds,
          expiresAt,
          createdById: request.user.sub,
        },
      })

      // Return the opaque token once — it cannot be recovered after this response.
      return reply.status(201).send({
        id: record.id,
        token: opaqueToken,
        portalUrl: `/portal?token=${opaqueToken}`,
        contractorName: body.contractorName,
        workOrderIds: body.workOrderIds,
        expiresAt: expiresAt.toISOString(),
      })
    },
  )

  // ── DELETE /contractor/tokens/:id ─────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/tokens/:id',
    {
      schema: { tags: ['contractor'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'assign'),
    },
    async (request, reply) => {
      const record = await request.server.prisma.contractorToken.findFirst({
        where: { id: request.params.id, tenantId: request.user.tid },
      })
      if (!record) throw new DomainException('Token not found', 'NOT_FOUND', 404)

      await request.server.prisma.contractorToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      })
      return reply.status(204).send()
    },
  )

  // ── GET /contractor/portal/auth ────────────────────────────────────────────
  fastify.get(
    '/portal/auth',
    {
      schema: {
        description: 'Exchange a contractor token for portal session info. Returns scoped WO IDs.',
        tags: ['contractor'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      } as OASSchema,
    },
    async (request, reply) => {
      const { token } = request.query as { token: string }
      if (!token)
        throw new DomainException('token query param is required', 'VALIDATION_ERROR', 400)

      const hash = hashToken(token)
      const record = await request.server.prisma.contractorToken.findUnique({
        where: { tokenHash: hash },
      })

      if (!record) throw new DomainException('Invalid token', 'UNAUTHORIZED', 401)
      if (record.revokedAt) throw new DomainException('Token has been revoked', 'UNAUTHORIZED', 401)
      if (record.expiresAt < new Date())
        throw new DomainException('Token has expired', 'UNAUTHORIZED', 401)

      return reply.send({
        contractorName: record.contractorName,
        contractorEmail: record.contractorEmail,
        workOrderIds: record.workOrderIds,
        tenantId: record.tenantId,
        expiresAt: record.expiresAt.toISOString(),
      })
    },
  )

  // ── GET /contractor/portal/work-orders ─────────────────────────────────────
  fastify.get(
    '/portal/work-orders',
    {
      schema: {
        description: 'Return work orders scoped to a contractor token.',
        tags: ['contractor'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      } as OASSchema,
    },
    async (request, reply) => {
      const { token } = request.query as { token: string }
      if (!token)
        throw new DomainException('token query param is required', 'VALIDATION_ERROR', 400)

      const hash = hashToken(token)
      const record = await request.server.prisma.contractorToken.findUnique({
        where: { tokenHash: hash },
      })

      if (!record || record.revokedAt || record.expiresAt < new Date()) {
        throw new DomainException('Invalid or expired token', 'UNAUTHORIZED', 401)
      }

      const workOrders = await request.server.prisma.workOrder.findMany({
        where: {
          id: { in: record.workOrderIds },
          tenantId: record.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          woNumber: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          status: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          asset: { select: { id: true, assetNumber: true, name: true } },
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send({
        contractorName: record.contractorName,
        workOrders,
        expiresAt: record.expiresAt.toISOString(),
      })
    },
  )
}

export default contractorRoutes
