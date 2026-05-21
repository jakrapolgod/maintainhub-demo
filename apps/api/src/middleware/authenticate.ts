import type { preHandlerHookHandler } from 'fastify'
import { withTenantFilter } from '../lib/tenant-prisma'

/**
 * Fastify preHandler that verifies the Bearer JWT and populates request.db
 * with a tenant-scoped Prisma client.
 *
 * After this runs:
 *  - request.user    → decoded JwtPayload (sub, tid, role, email, slug)
 *  - request.db      → Prisma client that injects tenantId into every query
 *
 * Usage:
 *   fastify.addHook('preHandler', authenticate)     // entire plugin scope
 *   fastify.get('/me', { preHandler: authenticate }, handler)  // single route
 *
 * On JWT failure @fastify/jwt throws a 401 FastifyError which app.setErrorHandler
 * returns as { code, message, requestId }.
 */
export const authenticate: preHandlerHookHandler = async (request) => {
  await request.jwtVerify()
  // Populate the tenant-scoped client immediately after verification so all
  // downstream handlers get isolation for free without extra boilerplate.
  request.db = withTenantFilter(request.server.prisma, request.user.tid)
}
