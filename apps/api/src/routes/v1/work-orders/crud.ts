import type { FastifyPluginAsync } from 'fastify'
import { auditFrom } from '../../../lib/audit'
import { requirePermission } from '../../../middleware/require-permission'
import { CreateWoSchema, ListWoQuerySchema, UpdateWoSchema } from '../../../schemas/work-order'
import { WorkOrderService } from '../../../services/work-order.service'

const crudRoutes: FastifyPluginAsync = async (fastify) => {
  // ── List ───────────────────────────────────────────────────────────────────
  // CONTRACTOR sees only WOs they are assigned to (requiresOwnership = true)
  fastify.get(
    '/',
    { preHandler: requirePermission('work-order', 'read') },
    async (request, reply) => {
      const query = ListWoQuerySchema.parse(request.query)
      const svc = new WorkOrderService(request.db, request.user.tid)
      return reply.send(
        await svc.list(query, {
          requiresOwnership: request.requiresOwnership,
          requesterId: request.user.sub,
        }),
      )
    },
  )

  // ── Get detail ─────────────────────────────────────────────────────────────
  // CONTRACTOR can only fetch WOs they are assigned to
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('work-order', 'read') },
    async (request, reply) => {
      const svc = new WorkOrderService(request.db, request.user.tid)
      return reply.send(
        await svc.getById(request.params.id, {
          requiresOwnership: request.requiresOwnership,
          requesterId: request.user.sub,
        }),
      )
    },
  )

  // ── Create ─────────────────────────────────────────────────────────────────
  fastify.post(
    '/',
    { preHandler: requirePermission('work-order', 'create') },
    async (request, reply) => {
      const dto = CreateWoSchema.parse(request.body)
      const svc = new WorkOrderService(request.db, request.user.tid)
      return reply.status(201).send(await svc.create(dto, auditFrom(request)))
    },
  )

  // ── Update ─────────────────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('work-order', 'update') },
    async (request, reply) => {
      const dto = UpdateWoSchema.parse(request.body)
      const svc = new WorkOrderService(request.db, request.user.tid)
      return reply.send(await svc.update(request.params.id, dto, auditFrom(request)))
    },
  )
}

export default crudRoutes
