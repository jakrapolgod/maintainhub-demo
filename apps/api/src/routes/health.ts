import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceOk {
  status: 'ok'
  latencyMs: number
}

interface ServiceError {
  status: 'error'
  error: string
}

type ServiceStatus = ServiceOk | ServiceError

interface HealthBody {
  status: 'ok' | 'degraded'
  timestamp: string
  version: string
  uptime: number
  services: {
    database: ServiceStatus
    redis: ServiceStatus
  }
}

// Augment FastifyContextConfig so routes can declare skipAuth: true.
// The auth middleware added in Sprint 3 will read this flag.
declare module 'fastify' {
  interface FastifyContextConfig {
    skipAuth?: boolean
  }
}

// ── JSON Schema ───────────────────────────────────────────────────────────────
// Used by Fastify for fast-json-stringify serialization.
// OpenAPI description/tags will be added when @fastify/swagger is wired up.

const serviceStatusSchema = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    latencyMs: { type: 'number' },
    error: { type: 'string' },
  },
} as const

const healthResponseSchema = {
  type: 'object',
  required: ['status', 'timestamp', 'version', 'uptime', 'services'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    timestamp: { type: 'string' },
    version: { type: 'string' },
    uptime: { type: 'number' },
    services: {
      type: 'object',
      required: ['database', 'redis'],
      properties: {
        database: serviceStatusSchema,
        redis: serviceStatusSchema,
      },
    },
  },
} as const

// ── Service checks ────────────────────────────────────────────────────────────

async function checkDatabase(prisma: PrismaClient): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown database error',
    }
  }
}

async function checkRedis(client: Redis): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const pong = await client.ping()
    if (pong !== 'PONG') {
      return { status: 'error', error: `Unexpected response: ${pong}` }
    }
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown Redis error',
    }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthBody }>(
    '/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
      // Skip rate-limiting for this endpoint so load balancers / k8s probes
      // can poll freely without consuming the caller's request budget.
      config: { rateLimit: false, skipAuth: true },
    },
    async (_request, reply) => {
      // allSettled ensures one failure doesn't prevent checking the other service.
      // 'as const' gives a readonly tuple → TypeScript knows exactly 2 results,
      // so [0] and [1] are never undefined (no noUncheckedIndexedAccess issue).
      const [dbResult, redisResult] = await Promise.allSettled([
        checkDatabase(fastify.prisma),
        checkRedis(fastify.redis),
      ] as const)

      const database: ServiceStatus =
        dbResult.status === 'fulfilled'
          ? dbResult.value
          : { status: 'error', error: String(dbResult.reason) }

      const redis: ServiceStatus =
        redisResult.status === 'fulfilled'
          ? redisResult.value
          : { status: 'error', error: String(redisResult.reason) }

      const allHealthy = database.status === 'ok' && redis.status === 'ok'

      const body: HealthBody = {
        status: allHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.0.0',
        uptime: Math.floor(process.uptime()),
        services: { database, redis },
      }

      return reply.status(allHealthy ? 200 : 503).send(body)
    },
  )
}

export default healthRoute
