import fp from 'fastify-plugin'
import { type EmailService, emailService } from '../lib/email'

declare module 'fastify' {
  interface FastifyInstance {
    email: EmailService
  }
}

export default fp(
  async (fastify) => {
    fastify.decorate('email', emailService)

    fastify.addHook('onClose', () => {
      fastify.log.info('Email transport closed')
    })
  },
  { name: 'email' },
)
