/**
 * Labor-entry routes — log time worked on a work order.
 *
 * POST /:id/labor — record a labor entry (dispatches AddLaborCommand)
 * GET  /:id/labor — list all labor entries for a work order
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { AddLaborHandler } from '../../../application/work-orders/commands/index.js'
import { buildCmdCtx, makeWoRepo, idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schema ────────────────────────────────────────────────────────────────

const laborBodySchema = z.object({
  /** ISO date string (YYYY-MM-DD). */
  date:        z.coerce.date(),
  /** Hours worked — 0.5 to 24 in 0.5-hour increments. */
  hours:       z.number().min(0.5, 'Minimum 0.5 hours').max(24, 'Maximum 24 hours per entry')
                 .multipleOf(0.5, 'Hours must be in 30-minute increments'),
  /** Hourly rate in tenant base currency (THB). */
  rate:        z.number().positive('Rate must be positive').max(999_999),
  description: z.string().trim().max(500).optional(),
})

type IdParam = { Params: { id: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const laborRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /:id/labor ────────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/labor',
    {
      schema: {
        description: 'Record hours worked on this work order. WO must be IN_PROGRESS. Assigned technicians and managers only.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['date', 'hours', 'rate'],
          properties: {
            date:        { type: 'string', format: 'date', description: 'YYYY-MM-DD' },
            hours:       { type: 'number', minimum: 0.5, maximum: 24, multipleOf: 0.5 },
            rate:        { type: 'number', minimum: 0, maximum: 999999, description: 'Hourly rate (THB)' },
            description: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
        response: {
          201: { type: 'object',
            properties: { id: { type: 'string' } },
          },
          401: { description: 'Unauthorised',        ...errorBody },
          403: { description: 'Forbidden',           ...errorBody },
          404: { description: 'Not found',           ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'add-labor'),
    },
    async (request, reply) => {
      const body    = laborBodySchema.parse(request.body)
      const ctx     = buildCmdCtx(request)
      const woRepo  = makeWoRepo(request)
      const handler = new AddLaborHandler(request.db, request.server.prisma, woRepo)

      const entryId = await handler.handle(
        {
          workOrderId: request.params.id,
          hours:       body.hours,
          ratePerHour: body.rate,
          date:        body.date,
          ...(body.description !== undefined && { description: body.description }),
        },
        ctx,
      )

      return reply.status(201).send({ id: entryId })
    },
  )

  // ── GET /:id/labor ─────────────────────────────────────────────────────────
  fastify.get<IdParam>(
    '/:id/labor',
    {
      schema: {
        description: 'List all labor entries for a work order, newest first.',
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
      const entries = await request.db.laborEntry.findMany({
        where:   { workOrderId: request.params.id },
        orderBy: { date: 'desc' },
        include: { technician: { select: { id: true, name: true, avatarUrl: true } } },
      })

      const items = entries.map((e) => ({
        id:             e.id,
        technicianId:   e.technicianId,
        technicianName: e.technician.name,
        date:           e.date.toISOString().slice(0, 10),
        hours:          Number(e.hours),
        ratePerHour:    Number(e.ratePerHour),
        totalCost:      Number(e.totalCost),
        description:    e.description ?? null,
      }))

      return reply.send(items)
    },
  )
}

export default laborRoutes
