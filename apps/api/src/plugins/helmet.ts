import helmet from '@fastify/helmet'
import fp from 'fastify-plugin'

export default fp(
  async (fastify) => {
    await fastify.register(helmet, {
      // Disabled for a pure JSON API — no HTML surfaces to protect
      contentSecurityPolicy: false,
      // Keep useful headers: HSTS, X-Frame-Options, X-Content-Type-Options, etc.
      crossOriginEmbedderPolicy: false,
    })
  },
  { name: 'helmet' },
)
