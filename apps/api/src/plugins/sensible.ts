import sensible from '@fastify/sensible'
import fp from 'fastify-plugin'

// Adds reply.badRequest(), reply.notFound(), reply.internalServerError(), etc.
// and fastify.httpErrors for use in application code.
export default fp(
  async (fastify) => {
    await fastify.register(sensible)
  },
  { name: 'sensible' },
)
