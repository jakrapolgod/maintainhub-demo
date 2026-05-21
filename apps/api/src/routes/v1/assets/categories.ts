import type { FastifyPluginAsync } from 'fastify'
import { auditFrom } from '../../../lib/audit'
import { requirePermission } from '../../../middleware/require-permission'
import { CreateAssetCategorySchema, UpdateAssetCategorySchema } from '../../../schemas/asset'
import { AssetService } from '../../../services/asset.service'

const categoryRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /assets/categories ─────────────────────────────────────────────────
  fastify.get(
    '/',
    { preHandler: requirePermission('asset-category', 'read') },
    async (request, reply) => {
      const svc = new AssetService(request.db, request.user.tid)
      return reply.send(await svc.listCategories())
    },
  )

  // ── POST /assets/categories ────────────────────────────────────────────────
  fastify.post(
    '/',
    { preHandler: requirePermission('asset-category', 'create') },
    async (request, reply) => {
      const dto = CreateAssetCategorySchema.parse(request.body)
      const svc = new AssetService(request.db, request.user.tid)
      return reply.status(201).send(await svc.createCategory(dto, auditFrom(request)))
    },
  )

  // ── PATCH /assets/categories/:id ──────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('asset-category', 'update') },
    async (request, reply) => {
      const dto = UpdateAssetCategorySchema.parse(request.body)
      const svc = new AssetService(request.db, request.user.tid)
      return reply.send(await svc.updateCategory(request.params.id, dto, auditFrom(request)))
    },
  )

  // ── DELETE /assets/categories/:id ─────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('asset-category', 'delete') },
    async (request, reply) => {
      const svc = new AssetService(request.db, request.user.tid)
      await svc.deleteCategory(request.params.id, auditFrom(request))
      return reply.status(204).send()
    },
  )
}

export default categoryRoutes
