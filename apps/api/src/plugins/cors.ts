import cors from '@fastify/cors'
import fp from 'fastify-plugin'
import { config } from '../config'

export default fp(
  async (fastify) => {
    const origin: boolean | string[] =
      config.NODE_ENV === 'development' || config.CORS_ORIGINS === '*'
        ? true
        : config.CORS_ORIGINS.split(',')
            .map((o) => o.trim())
            .filter(Boolean)

    await fastify.register(cors, {
      origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    })

    fastify.log.info({ origin }, 'CORS registered')
  },
  { name: 'cors' },
)
