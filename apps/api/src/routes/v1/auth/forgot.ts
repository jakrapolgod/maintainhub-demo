import type { FastifyPluginAsync } from 'fastify'
import { ForgotPasswordBodySchema } from '../../../schemas/auth'
import { AuthService, RESET_EXPIRES_MINUTES } from '../../../services/auth.service'

const forgotPasswordRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/forgot-password',
    {
      config: {
        skipAuth: true,
        // Intentionally low to prevent abuse; response time is always constant
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const dto = ForgotPasswordBodySchema.parse(request.body)

      const svc = new AuthService(fastify.prisma, fastify.redis)
      const result = await svc.forgotPassword(dto)

      // Always return 200 with a generic message — never reveal whether the account exists
      if (result) {
        const resetUrl = `${fastify.config.APP_URL}/reset-password?token=${encodeURIComponent(result.rawToken)}`

        await fastify.email
          .sendPasswordReset({
            to: dto.email,
            tenantName: result.tenantName,
            resetUrl,
            expiresMinutes: RESET_EXPIRES_MINUTES,
          })
          .catch((err: unknown) => {
            request.log.warn({ err, to: dto.email }, 'Password reset email delivery failed')
          })

        request.log.info({ email: dto.email }, 'Password reset email sent')

        // Expose token in non-production for easy testing without SMTP
        if (fastify.config.NODE_ENV !== 'production') {
          return reply.status(200).send({
            message: 'If an account with that email exists, a reset link has been sent.',
            devToken: result.rawToken,
          })
        }
      }

      return reply.status(200).send({
        message: 'If an account with that email exists, a reset link has been sent.',
      })
    },
  )
}

export default forgotPasswordRoute
