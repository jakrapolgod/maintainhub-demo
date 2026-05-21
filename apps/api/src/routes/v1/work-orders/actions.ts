/**
 * Work-order lifecycle action routes.
 *
 * POST /:id/assign   — add one or more technicians to the assignee list
 * POST /:id/start    — transition OPEN → IN_PROGRESS
 * POST /:id/complete — transition IN_PROGRESS → COMPLETED
 * POST /:id/hold     — transition IN_PROGRESS → ON_HOLD
 * POST /:id/cancel   — transition any non-terminal state → CANCELLED
 *
 * Every handler dispatches the corresponding CQRS command; the command
 * handler owns all business-rule validation and audit-log writing.
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { invalidateListCache } from '../../../application/work-orders/queries/index.js'
import {
  AssignWorkOrderHandler,
  StartWorkOrderHandler,
  CompleteWorkOrderHandler,
  HoldWorkOrderHandler,
  CancelWorkOrderHandler,
} from '../../../application/work-orders/commands/index.js'
import { buildCmdCtx, makeWoRepo, idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const assignBodySchema = z.object({
  technicianIds: z.array(z.string().cuid('Each technicianId must be a valid CUID')).min(1),
})

const completeBodySchema = z.object({
  resolution:    z.string().trim().min(10, 'Resolution must be at least 10 characters').max(5_000),
  failureCodeId: z.string().cuid().optional(),
})

const holdBodySchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1_000),
})

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1_000),
})

// ── Shared generics ───────────────────────────────────────────────────────────

type IdParam = { Params: { id: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const actionRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /:id/assign ───────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/assign',
    {
      schema: {
        description: 'Assign one or more technicians to a work order. Dispatches AssignWorkOrderCommand for each ID.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['technicianIds'],
          properties: {
            technicianIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: 'object',
                 properties: { assigned: { type: 'integer' } } },
          401: { description: 'Unauthorised',        ...errorBody },
          403: { description: 'Forbidden',           ...errorBody },
          404: { description: 'WO or user not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'assign'),
    },
    async (request, reply) => {
      const { technicianIds } = assignBodySchema.parse(request.body)
      const ctx    = buildCmdCtx(request)
      const woRepo = makeWoRepo(request)

      // Dispatch one command per technician in sequence — parallel would cause
      // a write-after-read race on the aggregate (second save overwrites first).
      // eslint-disable-next-line no-await-in-loop
      for (const technicianId of technicianIds) {
        const handler = new AssignWorkOrderHandler(request.db, request.server.prisma, woRepo)
        // eslint-disable-next-line no-await-in-loop
        await handler.handle({ workOrderId: request.params.id, technicianId }, ctx)
      }

      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.send({ assigned: technicianIds.length })
    },
  )

  // ── POST /:id/start ────────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/start',
    {
      schema: {
        description: 'Transition a work order from OPEN to IN_PROGRESS. Assigned technicians and privileged roles only.',
        tags:        ['work-orders'],
        security:    [{ bearerAuth: [] }],
        params:      idParam,
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised',        ...errorBody },
          403: { description: 'Forbidden',           ...errorBody },
          404: { description: 'Not found',           ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'start'),
    },
    async (request, reply) => {
      const ctx     = buildCmdCtx(request)
      const woRepo  = makeWoRepo(request)
      const handler = new StartWorkOrderHandler(request.db, request.server.prisma, woRepo)
      await handler.handle({ workOrderId: request.params.id }, ctx)
      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── POST /:id/complete ─────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/complete',
    {
      schema: {
        description: 'Mark an IN_PROGRESS work order as COMPLETED. Requires a resolution description (≥10 chars).',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['resolution'],
          properties: {
            resolution:    { type: 'string', minLength: 10, maxLength: 5000 },
            failureCodeId: { type: 'string', description: 'ISO 14224 failure code CUID' },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised',        ...errorBody },
          403: { description: 'Forbidden',           ...errorBody },
          404: { description: 'Not found',           ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'complete'),
    },
    async (request, reply) => {
      const body    = completeBodySchema.parse(request.body)
      const ctx     = buildCmdCtx(request)
      const woRepo  = makeWoRepo(request)
      const handler = new CompleteWorkOrderHandler(request.db, request.server.prisma, woRepo)

      await handler.handle(
        {
          workOrderId: request.params.id,
          resolution:  body.resolution,
          ...(body.failureCodeId !== undefined && { failureCodeId: body.failureCodeId }),
        },
        ctx,
      )

      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── POST /:id/hold ─────────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/hold',
    {
      schema: {
        description: 'Pause an IN_PROGRESS work order (e.g. waiting for parts). Requires a reason.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised',        ...errorBody },
          403: { description: 'Forbidden',           ...errorBody },
          404: { description: 'Not found',           ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      // Technicians, Managers and Admins can all put a WO on hold
      preHandler: requirePermission('work-order', 'start'),
    },
    async (request, reply) => {
      const { reason } = holdBodySchema.parse(request.body)
      const ctx        = buildCmdCtx(request)
      const woRepo     = makeWoRepo(request)
      const handler    = new HoldWorkOrderHandler(request.db, request.server.prisma, woRepo)
      await handler.handle({ workOrderId: request.params.id, reason }, ctx)
      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── POST /:id/cancel ───────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/cancel',
    {
      schema: {
        description: 'Cancel a work order. COMPLETED WOs cannot be cancelled. MANAGER and ADMIN only.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised',             ...errorBody },
          403: { description: 'Forbidden',                ...errorBody },
          404: { description: 'Not found',                ...errorBody },
          422: { description: 'Business rule error',      ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'cancel'),
    },
    async (request, reply) => {
      const { reason } = cancelBodySchema.parse(request.body)
      const ctx        = buildCmdCtx(request)
      const woRepo     = makeWoRepo(request)
      const handler    = new CancelWorkOrderHandler(request.db, request.server.prisma, woRepo)
      await handler.handle({ workOrderId: request.params.id, reason }, ctx)
      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )
}

export default actionRoutes
