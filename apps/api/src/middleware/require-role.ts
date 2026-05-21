import type { preHandlerHookHandler } from 'fastify'
import type { Role } from '@prisma/client'
import { DomainException } from '../errors/domain.exception'
import { withTenantFilter } from '../lib/tenant-prisma'

/**
 * Returns a Fastify preHandler that:
 *  1. Verifies the Bearer JWT (same as authenticate)
 *  2. Populates request.db with a tenant-scoped Prisma client
 *  3. Enforces that the caller holds one of the permitted roles
 *
 * Usage:
 *   // Single role
 *   fastify.delete('/tenant', { preHandler: requireRole('ADMIN') }, handler)
 *
 *   // Multiple roles (OR logic)
 *   fastify.post('/work-orders', { preHandler: requireRole('ADMIN', 'MANAGER') }, handler)
 *
 *   // Entire plugin scope
 *   fastify.addHook('preHandler', requireRole('ADMIN', 'MANAGER', 'TECHNICIAN'))
 */
export function requireRole(...allowed: Role[]): preHandlerHookHandler {
  return async (request) => {
    await request.jwtVerify()
    request.db = withTenantFilter(request.server.prisma, request.user.tid)

    if (!allowed.includes(request.user.role)) {
      throw new DomainException(
        `Access denied — required role: ${allowed.join(' | ')}`,
        'FORBIDDEN',
        403,
      )
    }
  }
}
