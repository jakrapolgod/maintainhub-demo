/**
 * Analytics routes for work-order dashboards and calendar views.
 *
 * GET /metrics  — aggregated KPIs (Redis-cached 5 min, ADMIN/MANAGER only)
 * GET /calendar — WOs + PM due dates grouped by calendar day (all roles)
 *
 * ## Metrics response
 *   byStatus            — count per WOStatus
 *   byPriority          — count per Priority
 *   overdueCount        — past-SLA WOs in non-terminal states
 *   avgCompletionHours  — mean time from creation to completion (null = no data)
 *   mttr                — alias for avgCompletionHours (Mean Time To Repair)
 *   totalCost           — sum of labor + parts cost for completed WOs in range
 *   trend               — daily/weekly/monthly counts, broken down by status
 *
 * ## Caching
 * Metrics are cached in Redis keyed by `wo:metrics:{tenantId}:{dateHash}`
 * with a 5-minute TTL.  The cache is not invalidated on WO mutation because
 * a 5-minute lag is acceptable for dashboard data.
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import { requirePermission } from '../../../middleware/require-permission.js'
import {
  GetWorkOrderMetricsHandler,
  GetWorkOrderCalendarHandler,
} from '../../../application/work-orders/queries/index.js'
import type { QueryContext } from '../../../application/work-orders/queries/index.js'
import { errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS_TTL_SECONDS = 300 // 5 minutes

// ── Zod schemas ───────────────────────────────────────────────────────────────

const metricsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

// ── Cache helpers (metrics-specific, 5-min TTL) ───────────────────────────────

function metricsCacheKey(tenantId: string, params: string): string {
  return `wo:metrics:${tenantId}:${params}`
}

async function metricsGet<T>(redis: Redis, key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

async function metricsSet(redis: Redis, key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', METRICS_TTL_SECONDS)
  } catch {
    // Cache writes are non-fatal
  }
}

// ── MTTR / groupBy helpers ────────────────────────────────────────────────────

interface TrendRow {
  period: Date
  status: string
  count: number
}

/**
 * Returns grouped WO counts using PostgreSQL DATE_TRUNC.
 * The `groupBy` value is validated by Zod (enum) before being passed to
 * Prisma.raw() — it is therefore safe from injection.
 */
async function fetchTrend(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: Date,
  dateTo: Date,
  groupBy: 'day' | 'week' | 'month',
): Promise<TrendRow[]> {
  // Prisma.raw inserts verbatim — wrap in single quotes so Postgres treats it
  // as a string literal, not an identifier.
  const trunc = Prisma.raw(`'${groupBy}'`)
  const rows = await prisma.$queryRaw<
    Array<{
      period: Date
      status: string
      count: bigint
    }>
  >`
    SELECT
      DATE_TRUNC(${trunc}, "createdAt") AS period,
      status,
      COUNT(*)::INTEGER                AS count
    FROM "WorkOrder"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${dateFrom}
      AND "createdAt" <= ${dateTo}
    GROUP BY period, status
    ORDER BY period ASC
  `
  return rows.map((r) => ({
    period: r.period,
    status: r.status,
    count: Number(r.count),
  }))
}

function buildQryCtx(request: FastifyRequest): QueryContext {
  return {
    executingUserId: request.user.sub,
    tenantId: request.user.tid,
    userRole: request.user.role,
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /metrics ───────────────────────────────────────────────────────────
  // Static path — registered before dynamic /:id routes.
  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Aggregated work-order KPIs for the dashboard. Cached in Redis for 5 minutes.',
        tags: ['work-orders', 'analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            dateFrom: {
              type: 'string',
              format: 'date-time',
              description: 'Range start (ISO 8601)',
            },
            dateTo: { type: 'string', format: 'date-time', description: 'Range end (ISO 8601)' },
            groupBy: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              byStatus: { type: 'object' },
              byPriority: { type: 'object' },
              overdueCount: { type: 'integer' },
              avgCompletionHours: { type: 'number', nullable: true },
              mttr: { type: 'number', nullable: true, description: 'Mean Time To Repair (hours)' },
              totalCost: { type: 'number' },
              trend: { type: 'array', items: { type: 'object' } },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
        },
      } as OASSchema,
      // 'audit-log:read' allows ADMIN + MANAGER — matches the "MANAGER, ADMIN" requirement
      preHandler: requirePermission('audit-log', 'read'),
    },
    async (request, reply) => {
      const q = metricsQuerySchema.parse(request.query)
      const asOf = q.dateTo ? new Date(q.dateTo) : new Date()
      const dateFrom = q.dateFrom
        ? new Date(q.dateFrom)
        : new Date(Date.now() - 30 * 24 * 3_600_000)

      // ── Cache check ────────────────────────────────────────────────────────
      const cacheParams = JSON.stringify({
        df: dateFrom.toISOString(),
        dt: asOf.toISOString(),
        g: q.groupBy,
      })
      const cacheKey = metricsCacheKey(request.user.tid, cacheParams)
      const cached = await metricsGet(request.server.redis, cacheKey)
      if (cached !== null) return reply.send(cached)

      // ── Base metrics (status/priority counts, overdue) ─────────────────────
      const baseHandler = new GetWorkOrderMetricsHandler(request.db, request.server.prisma)
      const base = await baseHandler.handle({ asOf }, buildQryCtx(request))

      // ── Date-range cost + MTTR ─────────────────────────────────────────────
      const completedRows = await request.server.prisma.workOrder.findMany({
        where: {
          tenantId: request.user.tid,
          status: 'COMPLETED',
          completedAt: { gte: dateFrom, lte: asOf },
          deletedAt: null,
        },
        select: { createdAt: true, completedAt: true, totalLaborCost: true, totalPartsCost: true },
      })

      let totalCost = 0
      let totalHours = 0
      let completedWithDate = 0

      for (const r of completedRows) {
        const labor = r.totalLaborCost !== null ? Number(r.totalLaborCost) : 0
        const parts = r.totalPartsCost !== null ? Number(r.totalPartsCost) : 0
        totalCost += labor + parts

        if (r.completedAt) {
          totalHours += (r.completedAt.getTime() - r.createdAt.getTime()) / 3_600_000
          completedWithDate += 1
        }
      }

      const mttr =
        completedWithDate > 0 ? Math.round((totalHours / completedWithDate) * 100) / 100 : null
      const avgCompletionHours = mttr // same metric, two names

      // ── Trend (groupBy) ────────────────────────────────────────────────────
      const trendRows = await fetchTrend(
        request.server.prisma,
        request.user.tid,
        dateFrom,
        asOf,
        q.groupBy,
      )

      const trend = trendRows.map((r) => ({
        period: r.period.toISOString().slice(0, 10),
        status: r.status,
        count: r.count,
      }))

      // ── Compose result ─────────────────────────────────────────────────────
      const result = {
        byStatus: base.byStatus,
        byPriority: base.byPriority,
        overdueCount: base.overdueCount,
        avgCompletionHours,
        mttr,
        totalCost: Math.round(totalCost * 100) / 100,
        trend,
      }

      await metricsSet(request.server.redis, cacheKey, result)
      return reply.send(result)
    },
  )

  // ── GET /calendar ──────────────────────────────────────────────────────────
  fastify.get(
    '/calendar',
    {
      schema: {
        description:
          'Work orders and PM due dates grouped by calendar day for the given year/month.',
        tags: ['work-orders', 'analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['year', 'month'],
          properties: {
            year: { type: 'integer', minimum: 2000, maximum: 2100, description: 'Calendar year' },
            month: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
              description: 'Calendar month (1–12)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              days: { type: 'array', items: { type: 'object' } },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const { year, month } = calendarQuerySchema.parse(request.query)

      // Build YYYY-MM-DD range for the requested month
      const from = `${String(year)}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate() // day 0 of next month = last day of this month
      const to = `${String(year)}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const handler = new GetWorkOrderCalendarHandler(request.db, request.server.prisma)
      const result = await handler.handle({ from, to }, buildQryCtx(request))

      return reply.send(result)
    },
  )
}

export default analyticsRoutes
