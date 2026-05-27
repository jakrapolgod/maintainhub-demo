/**
 * Notifications routes (stub implementation).
 *
 * The current data model does not have a Notification table, so this module
 * synthesises notifications from existing domain events:
 *   - Overdue work orders       → WO_OVERDUE
 *   - Low-stock parts           → LOW_STOCK
 *   - PM schedules due this week → PM_DUE
 *
 * GET  /notifications           — list synthesised notifications  (all roles)
 * PATCH /notifications/:id/read  — mark as read (no-op; returns updated object)
 * PATCH /notifications/read-all  — mark all read (no-op)
 */
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'

// We keep a simple in-memory read-set per tenant (resets on restart).
// Good enough for demo purposes — replace with a DB table in production.
const readSet = new Map<string, Set<string>>() // tenantId → Set<notificationId>

function getReadSet(tenantId: string): Set<string> {
  if (!readSet.has(tenantId)) readSet.set(tenantId, new Set())
  return readSet.get(tenantId)!
}

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: requirePermission('asset', 'read') }, async (request, reply) => {
    const tenantId = request.user.tid
    const read = getReadSet(tenantId)
    const now = new Date()

    const [overdueWOs, lowStockParts, pmsDueSoon] = await Promise.all([
      // Overdue work orders (past due date, not completed/cancelled)
      request.server.prisma.workOrder.findMany({
        where: {
          tenantId,
          dueDate: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          deletedAt: null,
        },
        select: { id: true, woNumber: true, title: true, dueDate: true, priority: true },
        take: 20,
        orderBy: { dueDate: 'asc' },
      }),

      // Low-stock parts
      request.server.prisma.part
        .findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, partNumber: true, name: true, quantity: true, minimumStock: true },
        })
        .then((parts) => parts.filter((p) => p.quantity <= p.minimumStock)),

      // PM schedules with next due in the next 14 days
      request.server.prisma.pMSchedule.findMany({
        where: {
          tenantId,
          isActive: true,
          nextDue: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
        },
        select: { id: true, title: true, nextDue: true },
        take: 10,
      }),
    ])

    const notifications = [
      ...overdueWOs.map((wo) => ({
        id: `wo-overdue-${wo.id}`,
        type: 'WO_OVERDUE',
        title: `Overdue: ${wo.woNumber}`,
        message: `${wo.title} was due ${wo.dueDate?.toLocaleDateString('en-US') ?? 'unknown'}`,
        isRead: read.has(`wo-overdue-${wo.id}`),
        priority: wo.priority,
        linkUrl: `/work-orders/${wo.id}`,
        createdAt: wo.dueDate ?? now,
      })),
      ...lowStockParts.map((p) => ({
        id: `low-stock-${p.id}`,
        type: 'LOW_STOCK',
        title: `Low Stock: ${p.partNumber}`,
        message: `${p.name}: ${p.quantity} remaining (min: ${p.minimumStock})`,
        isRead: read.has(`low-stock-${p.id}`),
        priority: 'HIGH',
        linkUrl: `/inventory`,
        createdAt: now,
      })),
      ...pmsDueSoon.map((pm) => ({
        id: `pm-due-${pm.id}`,
        type: 'PM_DUE',
        title: `PM Due Soon`,
        message: `${pm.title} is due ${pm.nextDue?.toLocaleDateString('en-US') ?? 'this week'}`,
        isRead: read.has(`pm-due-${pm.id}`),
        priority: 'MEDIUM',
        linkUrl: `/pm-schedules`,
        createdAt: pm.nextDue ?? now,
      })),
    ]

    return reply.send(
      notifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    )
  })

  // ── PATCH /:id/read ───────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: requirePermission('asset', 'read') },
    async (request, reply) => {
      const { id } = request.params
      getReadSet(request.user.tid).add(id)
      return reply.send({ id, isRead: true })
    },
  )

  // ── PATCH /read-all ───────────────────────────────────────────────────────
  fastify.patch(
    '/read-all',
    { preHandler: requirePermission('asset', 'read') },
    async (request, reply) => {
      // We don't have IDs in advance, so just clear and mark a "all-read" sentinel
      getReadSet(request.user.tid).add('__all__')
      return reply.status(204).send()
    },
  )
}

export default notificationsRoutes
