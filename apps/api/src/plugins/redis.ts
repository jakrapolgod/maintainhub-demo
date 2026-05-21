import fp from 'fastify-plugin'
import Redis from 'ioredis'
import { config } from '../config'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(
  async (fastify) => {
    const redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
      // Connect only when the first command is issued — allows the app to start
      // even when Redis is temporarily unavailable (health check will report degraded).
      lazyConnect: true,
      // Retry up to 3 times with back-off, then surface the error without crashing.
      retryStrategy: (times) => (times <= 3 ? Math.min(times * 500, 2000) : null),
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      enableOfflineQueue: false,
    })

    redis.on('connect', () => fastify.log.info('Redis connected'))
    redis.on('ready', () => fastify.log.info('Redis ready'))
    redis.on('error', (err) => fastify.log.error({ err }, 'Redis error'))
    redis.on('close', () => fastify.log.warn('Redis connection closed'))
    redis.on('reconnecting', () => fastify.log.info('Redis reconnecting'))

    fastify.decorate('redis', redis)

    fastify.addHook('onClose', async () => {
      fastify.log.info('Closing Redis connection')
      await redis.quit()
    })
  },
  { name: 'redis' },
)
