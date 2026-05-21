import type { FastifyPluginAsync } from 'fastify'
import { AuthService } from '../../../services/auth.service'
import { REFRESH_COOKIE_NAME } from './shared'

const logoutRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/logout', { config: { skipAuth: true } }, async (request, reply) => {
    const token: string | undefined = request.cookies[REFRESH_COOKIE_NAME]

    if (token) {
      const svc = new AuthService(fastify.prisma, fastify.redis)
      await svc.logout(token)
    }

    // Clear cookie regardless of whether a token was present —
    // logout should always succeed from the client's perspective.
    void reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' })

    return reply.status(204).send()
  })
}

export default logoutRoute
