/**
 * Spare-parts inventory routes.
 *
 * GET  /parts                — paginated list with optional filters  (all roles)
 * GET  /parts/:partNumber    — single part by part number            (all roles)
 * PATCH /parts/:partNumber/stock  — adjust stock level               (ADMIN, MANAGER, TECHNICIAN)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'

const adjustStockBodySchema = z.object({
  /** Positive to add stock, negative to deduct */
  delta: z.number().int(),
  reason: z.string().trim().max(500).optional(),
})

const partsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: requirePermission('asset', 'read') }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const page = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit = parseInt(q.limit ?? q.pageSize ?? '20', 10)
    const pageSize = Math.min(100, Math.max(1, limit))
    const isLowStock = q.isLowStock === 'true'
    const search = q.search?.trim() ?? ''

    const baseWhere = {
      tenantId: request.user.tid,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { partNumber: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [items, total] = await Promise.all([
      request.server.prisma.part.findMany({
        where: baseWhere,
        orderBy: { partNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      request.server.prisma.part.count({ where: baseWhere }),
    ])

    // Filter low-stock in memory (simpler than building complex Prisma where)
    const filtered = isLowStock ? items.filter((p) => p.quantity <= p.minimumStock) : items

    return reply.send({
      items: filtered.map((p) => ({
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        description: p.description,
        quantity: p.quantity,
        reservedQty: p.reservedQty,
        minimumStock: p.minimumStock,
        unitCost: Number(p.unitCost),
        storeLocation: p.storeLocation,
        isLowStock: p.quantity <= p.minimumStock,
        customFields: p.customFields,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      pageSize,
    })
  })

  // ── GET /:partNumber ──────────────────────────────────────────────────────
  fastify.get<{ Params: { partNumber: string } }>(
    '/:partNumber',
    { preHandler: requirePermission('asset', 'read') },
    async (request, reply) => {
      const part = await request.server.prisma.part.findFirst({
        where: {
          tenantId: request.user.tid,
          partNumber: request.params.partNumber,
          deletedAt: null,
        },
      })
      if (!part) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Part not found' })

      return reply.send({
        id: part.id,
        partNumber: part.partNumber,
        name: part.name,
        description: part.description,
        quantity: part.quantity,
        reservedQty: part.reservedQty,
        minimumStock: part.minimumStock,
        unitCost: Number(part.unitCost),
        storeLocation: part.storeLocation,
        isLowStock: part.quantity <= part.minimumStock,
        customFields: part.customFields,
        createdAt: part.createdAt,
        updatedAt: part.updatedAt,
      })
    },
  )

  // ── PATCH /:partNumber/stock ──────────────────────────────────────────────
  fastify.patch<{ Params: { partNumber: string } }>(
    '/:partNumber/stock',
    { preHandler: requirePermission('asset', 'update') },
    async (request, reply) => {
      const body = adjustStockBodySchema.parse(request.body)
      const part = await request.server.prisma.part.findFirst({
        where: {
          tenantId: request.user.tid,
          partNumber: request.params.partNumber,
          deletedAt: null,
        },
      })
      if (!part) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Part not found' })

      const newQty = part.quantity + body.delta
      if (newQty < 0) {
        return reply
          .status(422)
          .send({ code: 'INSUFFICIENT_STOCK', message: 'Resulting quantity would be negative' })
      }

      const updated = await request.server.prisma.part.update({
        where: { id: part.id },
        data: { quantity: newQty, updatedAt: new Date() },
      })

      return reply.send({
        id: updated.id,
        partNumber: updated.partNumber,
        name: updated.name,
        quantity: updated.quantity,
        reservedQty: updated.reservedQty,
        minimumStock: updated.minimumStock,
        unitCost: Number(updated.unitCost),
        storeLocation: updated.storeLocation,
        isLowStock: updated.quantity <= updated.minimumStock,
        updatedAt: updated.updatedAt,
      })
    },
  )
}

export default partsRoutes
