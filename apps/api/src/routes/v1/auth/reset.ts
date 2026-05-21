import type { FastifyPluginAsync } from 'fastify'
import { ResetPasswordBodySchema } from '../../../schemas/auth'
import { AuthService } from '../../../services/auth.service'

const resetPasswordRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/reset-password',
    {
      config: {
        skipAuth: true,
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const dto = ResetPasswordBodySchema.parse(request.body)

      const svc = new AuthService(fastify.prisma, fastify.redis)
      await svc.resetPassword(dto)

      return reply.status(200).send({ message: 'Password updated successfully. Please log in.' })
    },
  )
}

export default resetPasswordRoute
