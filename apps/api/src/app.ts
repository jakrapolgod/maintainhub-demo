import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import Fastify from 'fastify'
import { ZodError } from 'zod'

import { config } from './config'
import { DomainException } from './errors/domain.exception'
import cookiePlugin from './plugins/cookie'
import corsPlugin from './plugins/cors'
import anthropicPlugin from './plugins/anthropic'
import emailPlugin from './plugins/email'
import helmetPlugin from './plugins/helmet'
import minioPlugin from './plugins/minio'
import meilisearchPlugin from './plugins/meilisearch'
import socketPlugin from './plugins/socket'
import jwtPlugin from './plugins/jwt'
import prismaPlugin from './plugins/prisma'
import rateLimitPlugin from './plugins/rate-limit'
import redisPlugin from './plugins/redis'
import sensiblePlugin from './plugins/sensible'
import healthRoute from './routes/health'
import v1Router from './routes/v1'

// ── Logger ────────────────────────────────────────────────────────────────────

function buildLoggerOptions() {
  if (config.NODE_ENV === 'development') {
    return {
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          colorize: true,
          singleLine: false,
        },
      },
    }
  }
  return { level: config.LOG_LEVEL }
}

// ── Factory ───────────────────────────────────────────────────────────────────

// Expose config on the Fastify instance so plugins and route handlers can read
// SMTP_FROM, APP_URL, NODE_ENV etc. without importing config directly.
declare module 'fastify' {
  interface FastifyInstance {
    config: typeof config
  }
}

export function buildApp() {
  const app = Fastify<Server>({
    logger: buildLoggerOptions(),
    genReqId: () => randomUUID(),
    trustProxy: config.NODE_ENV === 'production',
    ajv: {
      customOptions: { strict: 'log', keywords: ['kind', 'modifier'] },
    },
  })

  app.decorate('config', config)

  // ── Security & transport ─────────────────────────────────────────────────
  void app.register(helmetPlugin)
  void app.register(corsPlugin)
  void app.register(rateLimitPlugin)
  void app.register(sensiblePlugin)
  void app.register(cookiePlugin)
  void app.register(jwtPlugin)

  // Propagate request ID to every response header
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('X-Request-Id', _request.id)
  })

  // ── Infrastructure ───────────────────────────────────────────────────────
  void app.register(prismaPlugin)
  void app.register(redisPlugin)
  void app.register(emailPlugin)
  void app.register(minioPlugin)
  void app.register(meilisearchPlugin)
  void app.register(anthropicPlugin)
  // Socket.io must be registered after JWT plugin so the auth middleware can
  // access fastify.jwt.verify inside the socket handshake.
  void app.register(socketPlugin)

  // ── Routes ───────────────────────────────────────────────────────────────
  void app.register(healthRoute)
  void app.register(v1Router, { prefix: '/api/v1' })

  // ── Global error handler ─────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id

    // Zod input validation failures (thrown by schema.parse() in route handlers)
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten().fieldErrors,
        requestId,
      })
    }

    // Domain / business rule violations
    if (error instanceof DomainException) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId,
      })
    }

    // Fastify schema validation failure (AJV, body/params/query mismatch)
    if (error.validation) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
        requestId,
      })
    }

    const statusCode = error.statusCode ?? 500

    // 4xx client errors — safe to forward the message (includes JWT errors)
    if (statusCode < 500) {
      return reply.status(statusCode).send({
        code: (error as NodeJS.ErrnoException).code ?? 'CLIENT_ERROR',
        message: error.message,
        requestId,
      })
    }

    // 5xx — never leak internals to callers
    request.log.error({ err: error, requestId }, 'Unhandled server error')
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      requestId,
    })
  })

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      code: 'NOT_FOUND',
      message: `Route ${request.method}:${request.url} not found`,
      requestId: request.id,
    })
  })

  return app
}

export type App = ReturnType<typeof buildApp>
