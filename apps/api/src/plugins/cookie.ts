import cookiePlugin from '@fastify/cookie'
import fp from 'fastify-plugin'

export default fp(
  async (fastify) => {
    await fastify.register(cookiePlugin)
  },
  { name: 'cookie' },
)
