import type { FastifyPluginAsync } from 'fastify'
import { LoginBodySchema } from '../../../schemas/auth'
import { AuthService } from '../../../services/auth.service'
import { REFRESH_COOKIE_NAME, cookieOptions } from './shared'

const loginRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'tenantSlug'],
        },
      },
      config: { skipAuth: true, rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = LoginBodySchema.parse(request.body)

      const svc = new AuthService(fastify.prisma, fastify.redis)
      const { user, tenant, refreshToken } = await svc.login(body)

      const accessToken = fastify.jwt.sign({
        sub: user.id,
        tid: user.tenantId,
        role: user.role,
        email: user.email,
        slug: tenant.slug,
      })

      void reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions)

      return reply.status(200).send({ accessToken, user, tenant })
    },
  )
}

export default loginRoute
