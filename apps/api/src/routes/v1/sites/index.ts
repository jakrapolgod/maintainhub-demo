import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'

/**
 * GET /sites — lightweight site stub list, used by report filters / selectors.
 */
const siteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    { preHandler: requirePermission('location', 'read') },
    async (request, reply) => {
      const sites = await request.db.site.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      })
      return reply.send(sites)
    },
  )
}

export default siteRoutes
