import rateLimit, {
  type errorResponseBuilderContext,
  type RateLimitPluginOptions,
} from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import type { FastifyRequest } from 'fastify'

export default fp(
  async (fastify) => {
    const opts: RateLimitPluginOptions = {
      max: 100,
      timeWindow: '1 minute',

      // Use real client IP as the key.
      // fastify's `trustProxy` option (set in buildApp) ensures request.ip
      // reflects X-Forwarded-For when running behind a reverse proxy.
      keyGenerator: (request: FastifyRequest) => request.ip,

      // Return a consistent error envelope matching the rest of the API.
      errorResponseBuilder: (request: FastifyRequest, context: errorResponseBuilderContext) => ({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit reached — max ${String(context.max)} requests per ${String(context.after)}`,
        requestId: request.id,
        retryAfter: context.after,
      }),

      // TODO Sprint 4+: switch to a Redis store for distributed / multi-instance deployments.
      // store: new RedisStore({ client: fastify.redis }),
    }

    await fastify.register(rateLimit, opts)
  },
  { name: 'rate-limit' },
)
