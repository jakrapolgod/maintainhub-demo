import type { preHandlerHookHandler } from 'fastify'
import { DomainException } from '../errors/domain.exception'
import { can } from '../lib/permissions'
import type { Action, Resource } from '../lib/permissions'
import { withTenantFilter } from '../lib/tenant-prisma'

/**
 * Returns a Fastify preHandler that enforces the permission matrix.
 *
 * For every request it:
 *   1. Verifies the Bearer JWT → populates request.user
 *   2. Creates a tenant-scoped Prisma client → populates request.db
 *   3. Looks up can(role, resource, action) in the permission matrix
 *      • 'allow' → passes through
 *      • 'own'   → passes through AND sets request.requiresOwnership = true
 *                  so the route/service can apply the secondary ownership check
 *      • 'deny'  → throws 403 DomainException
 *
 * Usage:
 *   // Single resource+action
 *   fastify.post('/work-orders', { preHandler: requirePermission('work-order', 'create') }, handler)
 *
 *   // List route — CONTRACTOR sees only their own WOs
 *   fastify.get('/work-orders',  { preHandler: requirePermission('work-order', 'read') }, async (req, reply) => {
 *     const svc = new WorkOrderService(req.db, req.user.tid)
 *     return svc.list(query, { requiresOwnership: req.requiresOwnership, requesterId: req.user.sub })
 *   })
 */
export function requirePermission(resource: Resource, action: Action): preHandlerHookHandler {
  return async (request) => {
    await request.jwtVerify()
    request.db = withTenantFilter(request.server.prisma, request.user.tid)

    const permission = can(request.user.role, resource, action)

    if (permission === 'deny') {
      throw new DomainException(
        `Forbidden: ${request.user.role} cannot ${action} ${resource}`,
        'FORBIDDEN',
        403,
      )
    }

    // 'own' — the role has access only to resources it is assigned to.
    // Set the flag so the route/service can enforce the secondary check.
    request.requiresOwnership = permission === 'own'
  }
}
