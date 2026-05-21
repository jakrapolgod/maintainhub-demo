/**
 * Part-usage routes — record spare parts consumed on a work order.
 *
 * POST /:id/parts — record a part consumption (dispatches UsePartCommand)
 * GET  /:id/parts — list all part usages for a work order
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { UsePartHandler } from '../../../application/work-orders/commands/index.js'
import { buildCmdCtx, makeWoRepo, idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schema ────────────────────────────────────────────────────────────────

const partsBodySchema = z.object({
  partId:   z.string().cuid('partId must be a valid CUID'),
  quantity: z.number().int('Quantity must be a whole number').positive().max(10_000),
  /** Optional cost override — defaults to the part's current unit cost. */
  unitCost: z.number().nonnegative().max(9_999_999).optional(),
})

type IdParam = { Params: { id: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const partsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /:id/parts ────────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/parts',
    {
      schema: {
        description: 'Record spare-part consumption. Deducts from on-hand stock and updates the WO parts total.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['partId', 'quantity'],
          properties: {
            partId:   { type: 'string', description: 'Part CUID' },
            quantity: { type: 'integer', minimum: 1, maximum: 10000 },
            unitCost: { type: 'number', minimum: 0, description: 'Override unit cost (defaults to catalog price)' },
          },
          additionalProperties: false,
        },
        response: {
          201: { type: 'object',
            properties: { id: { type: 'string' } },
          },
          401: { description: 'Unauthorised',          ...errorBody },
          403: { description: 'Forbidden',             ...errorBody },
          404: { description: 'WO or part not found',  ...errorBody },
          422: { description: 'Business rule error',   ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'add-part'),
    },
    async (request, reply) => {
      const body    = partsBodySchema.parse(request.body)
      const ctx     = buildCmdCtx(request)
      const woRepo  = makeWoRepo(request)
      const handler = new UsePartHandler(request.db, request.server.prisma, woRepo)

      const usageId = await handler.handle(
        {
          workOrderId: request.params.id,
          partId:      body.partId,
          quantity:    body.quantity,
          ...(body.unitCost !== undefined && { unitCostOverride: body.unitCost }),
        },
        ctx,
      )

      return reply.status(201).send({ id: usageId })
    },
  )

  // ── GET /:id/parts ─────────────────────────────────────────────────────────
  fastify.get<IdParam>(
    '/:id/parts',
    {
      schema: {
        description: 'List all part usages for a work order, most recent first.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        response: {
          200: { type: 'array',
            items: { type: 'object' },
          },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found',    ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const usages = await request.db.partUsage.findMany({
        where:   { workOrderId: request.params.id },
        orderBy: { usedAt: 'desc' },
        include: {
          part: { select: { id: true, partNumber: true, name: true } },
        },
      })

      const items = usages.map((u) => ({
        id:         u.id,
        partId:     u.partId,
        partNumber: u.part.partNumber,
        partName:   u.part.name,
        quantity:   u.quantity,
        unitCost:   Number(u.unitCost),
        totalCost:  Number(u.totalCost),
        usedAt:     u.usedAt.toISOString(),
      }))

      return reply.send(items)
    },
  )
}

export default partsRoutes
