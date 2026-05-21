import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission'
import { WorkOrderService } from '../../../services/work-order.service'

const historyRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /work-orders/:id/history ───────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/history',
    { preHandler: requirePermission('work-order', 'read') },
    async (request, reply) => {
      const svc = new WorkOrderService(request.db, request.user.tid)
      return reply.send(await svc.getHistory(request.params.id))
    },
  )
}

export default historyRoutes
