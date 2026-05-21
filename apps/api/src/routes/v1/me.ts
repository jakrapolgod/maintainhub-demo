import type { FastifyPluginAsync } from 'fastify'
import { DomainException } from '../../errors/domain.exception'
import { authenticate } from '../../middleware/authenticate'

interface MeResponse {
  id: string
  email: string
  name: string
  role: string
  jobTitle: string | null
  phone: string | null
  avatarUrl: string | null
  lastLoginAt: string | null
  tenantId: string
  tenant: {
    id: string
    name: string
    slug: string
    plan: string
  }
}

const meRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: MeResponse }>(
    '/me',
    { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // request.db is tenant-scoped — no risk of leaking another tenant's user
      const user = await request.db.user.findFirst({
        where: { id: request.user.sub, deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          jobTitle: true,
          phone: true,
          avatarUrl: true,
          lastLoginAt: true,
          tenantId: true,
          tenant: {
            select: { id: true, name: true, slug: true, plan: true },
          },
        },
      })

      if (!user) {
        throw new DomainException('User not found', 'NOT_FOUND', 404)
      }

      return reply.status(200).send({
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        tenant: user.tenant,
      })
    },
  )
}

export default meRoute
