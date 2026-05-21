import type { FastifyPluginAsync } from 'fastify'
import { DomainException } from '../../../errors/domain.exception'
import { AuthService } from '../../../services/auth.service'
import { REFRESH_COOKIE_NAME, cookieOptions } from './shared'

const refreshRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/refresh', { config: { skipAuth: true } }, async (request, reply) => {
    const token: string | undefined = request.cookies[REFRESH_COOKIE_NAME]

    if (!token) {
      throw new DomainException('Refresh token missing', 'TOKEN_MISSING', 401)
    }

    const svc = new AuthService(fastify.prisma, fastify.redis)
    const { user, tenant, refreshToken } = await svc.refresh(token)

    const accessToken = fastify.jwt.sign({
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
      slug: tenant.slug,
    })

    void reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions)

    return reply.status(200).send({ accessToken })
  })
}

export default refreshRoute
