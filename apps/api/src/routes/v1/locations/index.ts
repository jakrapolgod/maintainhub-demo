import type { FastifyPluginAsync } from 'fastify'
import { auditFrom } from '../../../lib/audit'
import { requirePermission } from '../../../middleware/require-permission'
import { CreateLocationSchema, UpdateLocationSchema } from '../../../schemas/asset'
import { AssetService } from '../../../services/asset.service'

const locationRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /locations ─────────────────────────────────────────────────────────
  fastify.get(
    '/',
    { preHandler: requirePermission('location', 'read') },
    async (request, reply) => {
      const svc = new AssetService(request.db, request.user.tid)
      return reply.send(await svc.listLocations())
    },
  )

  // ── POST /locations ────────────────────────────────────────────────────────
  fastify.post(
    '/',
    { preHandler: requirePermission('location', 'create') },
    async (request, reply) => {
      const dto = CreateLocationSchema.parse(request.body)
      const svc = new AssetService(request.db, request.user.tid)
      return reply.status(201).send(await svc.createLocation(dto, auditFrom(request)))
    },
  )

  // ── PATCH /locations/:id ───────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('location', 'update') },
    async (request, reply) => {
      const dto = UpdateLocationSchema.parse(request.body)
      const svc = new AssetService(request.db, request.user.tid)
      return reply.send(await svc.updateLocation(request.params.id, dto, auditFrom(request)))
    },
  )

  // ── DELETE /locations/:id ──────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('location', 'delete') },
    async (request, reply) => {
      const svc = new AssetService(request.db, request.user.tid)
      await svc.deleteLocation(request.params.id, auditFrom(request))
      return reply.status(204).send()
    },
  )
}

export default locationRoutes
