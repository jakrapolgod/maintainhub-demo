/**
 * Asset sub-resource routes (read-only analytics).
 *
 * GET /:id/metrics      — MTBF, MTTR, availability, monthly trend
 * GET /:id/work-orders  — WO history, paginated + filterable
 * GET /:id/pm-schedules — active PM schedules for this asset
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { GetAssetMetricsHandler } from '../../../application/assets/queries/index.js'
import { assetIdParam, errorBody, buildQryCtx } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

function toStrArr(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined
  if (Array.isArray(v)) return v
  return [v]
}

const woListQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(toStrArr),
  type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(toStrArr),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const metricsQuerySchema = z.object({
  asOf: z.coerce.date().optional(),
})

// ── Plugin ────────────────────────────────────────────────────────────────────

const subResourceRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /:id/metrics ───────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/metrics',
    {
      schema: {
        description:
          'Asset reliability KPIs: MTBF, MTTR, availability (last 12 months), lifetime cost, monthly trend.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        querystring: {
          type: 'object',
          properties: { asOf: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = metricsQuerySchema.parse(request.query)
      const handler = new GetAssetMetricsHandler(request.db, request.server.prisma)
      const query = {
        assetId: request.params.id,
        ...(q.asOf !== undefined && { asOf: q.asOf }),
      }
      const result = await handler.handle(query, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /:id/work-orders ───────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/work-orders',
    {
      schema: {
        description: 'Paginated work order history for an asset, filterable by status and type.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'array', items: { type: 'string' } },
            type: { type: 'array', items: { type: 'string' } },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
            properties: {
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', additionalProperties: true },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = woListQuerySchema.parse(request.query)
      const skip = (q.page - 1) * q.limit

      const where: Record<string, unknown> = {
        assetId: request.params.id,
        deletedAt: null,
        ...(q.status !== undefined && { status: { in: q.status } }),
        ...(q.type !== undefined && { type: { in: q.type } }),
      }

      const [data, total] = await Promise.all([
        request.db.workOrder.findMany({
          where,
          skip,
          take: q.limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            woNumber: true,
            title: true,
            type: true,
            priority: true,
            status: true,
            startedAt: true,
            completedAt: true,
            totalLaborCost: true,
            totalPartsCost: true,
            createdAt: true,
          },
        }),
        request.db.workOrder.count({ where }),
      ])

      return reply.send({
        data,
        pagination: {
          total,
          page: q.page,
          limit: q.limit,
          totalPages: Math.ceil(total / q.limit),
        },
      })
    },
  )

  // ── GET /:id/pm-schedules ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/pm-schedules',
    {
      schema: {
        description: 'List active PM schedules for an asset, ordered by nextDue.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        querystring: {
          type: 'object',
          properties: {
            activeOnly: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const qs = request.query as Record<string, string>
      const activeOnly = qs.activeOnly !== 'false'

      const rows = await request.db.pMSchedule.findMany({
        where: { assetId: request.params.id, ...(activeOnly && { isActive: true }) },
        orderBy: { nextDue: 'asc' },
        select: {
          id: true,
          title: true,
          triggerType: true,
          nextDue: true,
          isActive: true,
          lastTriggered: true,
          estimatedHours: true,
        },
      })

      return reply.send(rows)
    },
  )
}

export default subResourceRoutes
