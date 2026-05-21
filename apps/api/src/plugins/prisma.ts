import { PrismaClient } from '@prisma/client'
import fp from 'fastify-plugin'
import { config } from '../config'
import type { TenantClient } from '../lib/tenant-prisma'

declare module 'fastify' {
  interface FastifyInstance {
    /** Base Prisma client — use request.db in route handlers instead */
    prisma: PrismaClient
  }
  interface FastifyRequest {
    /**
     * Tenant-scoped Prisma client populated by the authenticate middleware.
     * Every read/write automatically injects `tenantId` into WHERE / data so
     * cross-tenant data leaks are impossible without explicit opt-out.
     *
     * Only available on routes that run authenticate (or requireRole) as a
     * preHandler. Use fastify.prisma directly for public/system operations.
     */
    db: TenantClient

    /**
     * Set to true by requirePermission() when can() returns 'own'.
     *
     * Indicates the caller's role allows access only to resources they are
     * assigned to or own. Routes and services must enforce the secondary check:
     *
     *   if (request.requiresOwnership) {
     *     // verify request.user.sub ∈ resource.assigneeIds (or equivalent)
     *   }
     *
     * Always false for 'allow' permissions; always false on public routes.
     */
    requiresOwnership: boolean
  }
}

export default fp(
  async (fastify) => {
    const prisma = new PrismaClient({
      log:
        config.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
    })

    if (config.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        fastify.log.debug(
          { query: e.query, params: e.params, duration: e.duration },
          'Prisma query',
        )
      })
    }

    fastify.decorate('prisma', prisma)
    // Initialise request decoration defaults.
    // Both are overwritten by authenticate / requireRole / requirePermission
    // on every protected request before the route handler runs.
    fastify.decorateRequest('db', null)
    fastify.decorateRequest('requiresOwnership', false)

    fastify.addHook('onClose', async () => {
      fastify.log.info('Disconnecting Prisma client')
      await prisma.$disconnect()
    })
  },
  { name: 'prisma' },
)
