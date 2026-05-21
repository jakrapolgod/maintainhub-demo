import type { FastifyPluginAsync } from 'fastify'
import { RegisterBodySchema } from '../../../schemas/auth'
import { AuthService } from '../../../services/auth.service'
import { REFRESH_COOKIE_NAME, cookieOptions } from './shared'

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['companyName', 'slug', 'adminEmail', 'adminName', 'password'],
        },
      },
      config: { skipAuth: true, rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = RegisterBodySchema.parse(request.body)

      const svc = new AuthService(fastify.prisma, fastify.redis)
      const { user, tenant, refreshToken } = await svc.register(body)

      const accessToken = fastify.jwt.sign({
        sub: user.id,
        tid: user.tenantId,
        role: user.role,
        email: user.email,
        slug: tenant.slug,
      })

      void reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions)

      return reply.status(201).send({ accessToken, user, tenant })
    },
  )
}

export default registerRoute
