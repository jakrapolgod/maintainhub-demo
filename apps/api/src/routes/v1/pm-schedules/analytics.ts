/**
 * PM-schedule analytics / reporting routes.
 *
 * GET /calendar    — PM events grouped by calendar date in a range
 * GET /upcoming    — next 30/60/90 days grouped by ISO week
 * GET /compliance  — planned vs actual triggers over rolling 12 months
 * GET /cost        — estimated vs actual cost per schedule and per month
 *
 * These are all static paths and MUST be registered before /:id.
 */
import { z }                        from 'zod'
import type { FastifyPluginAsync }  from 'fastify'
import { requirePermission }        from '../../../middleware/require-permission.js'
import {
  GetPMCalendarHandler,
  GetUpcomingPMHandler,
  GetPMComplianceHandler,
  GetPMCostHandler,
} from '../../../application/pm-schedules/queries/index.js'
import { buildQryCtx, errorBody } from './route-helpers.js'
import type { OASSchema }          from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const calendarQuerySchema = z.object({
  from: z.coerce.date(),
  to:   z.coerce.date(),
})

const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().refine((v) => v === 30 || v === 60 || v === 90, {
    message: 'days must be 30, 60, or 90',
  }).default(30).transform((v) => v as 30 | 60 | 90),
})

const complianceQuerySchema = z.object({
  lookbackMonths: z.coerce.number().int().min(1).max(24).default(12),
})

const costQuerySchema = z.object({
  from:             z.coerce.date().optional(),
  to:               z.coerce.date().optional(),
  laborRatePerHour: z.coerce.number().positive().optional(),
})

// ── Plugin ────────────────────────────────────────────────────────────────────

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /calendar ─────────────────────────────────────────────────────────
  fastify.get(
    '/calendar',
    {
      schema: {
        description: [
          'PM calendar view. Returns all active schedules with nextDue in [from, to],',
          'grouped by calendar date. Includes assignee avatar stubs.',
          'Every day in the range appears in the response even if empty.',
        ].join(' '),
        tags:     ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', format: 'date-time', description: 'Range start (inclusive)' },
            to:   { type: 'string', format: 'date-time', description: 'Range end (inclusive)' },
          },
        },
        response: {
          200: { type: 'object',
            properties: {
              from:        { type: 'string' },
              to:          { type: 'string' },
              days:        { type: 'array', items: { type: 'object' } },
              totalEvents: { type: 'integer' },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised',      ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q       = calendarQuerySchema.parse(request.query)
      const handler = new GetPMCalendarHandler(request.db, request.server.prisma)
      const result  = await handler.handle({ from: q.from, to: q.to }, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /upcoming ─────────────────────────────────────────────────────────
  fastify.get(
    '/upcoming',
    {
      schema: {
        description: [
          'Upcoming PM schedules sorted by nextDueAt and grouped by ISO week.',
          'Overdue items are returned in a separate overdueItems list.',
          'Supported horizons: 30, 60, 90 days.',
        ].join(' '),
        tags:     ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'integer', enum: [30, 60, 90], default: 30, description: 'Lookahead horizon' },
          },
        },
        response: {
          200: { type: 'object',
            properties: {
              horizon:      { type: 'integer' },
              weeks:        { type: 'array', items: { type: 'object' } },
              overdueItems: { type: 'array', items: { type: 'object' } },
              totalItems:   { type: 'integer' },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised',      ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q       = upcomingQuerySchema.parse(request.query)
      const handler = new GetUpcomingPMHandler(request.db, request.server.prisma)
      const result  = await handler.handle({ horizon: q.days }, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /compliance ───────────────────────────────────────────────────────
  fastify.get(
    '/compliance',
    {
      schema: {
        description: [
          'PM compliance report. Compares planned triggers vs actual WOs created from PM schedules.',
          'Compliance % = actual / planned × 100, capped at 100%.',
          'Breakdowns by asset category and location.',
        ].join(' '),
        tags:     ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            lookbackMonths: {
              type: 'integer', minimum: 1, maximum: 24, default: 12,
              description: 'Rolling look-back period in months',
            },
          },
        },
        response: {
          200: { type: 'object',
            properties: {
              overallCompliancePct: { type: 'number' },
              periodStart:          { type: 'string' },
              periodEnd:            { type: 'string' },
              schedules:            { type: 'array', items: { type: 'object' } },
              byCategory:           { type: 'array', items: { type: 'object' } },
              byLocation:           { type: 'array', items: { type: 'object' } },
              totalSchedules:       { type: 'integer' },
              fullyCompliant:       { type: 'integer' },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden',    ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q       = complianceQuerySchema.parse(request.query)
      const handler = new GetPMComplianceHandler(request.db, request.server.prisma)
      const result  = await handler.handle({ lookbackMonths: q.lookbackMonths }, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /cost ─────────────────────────────────────────────────────────────
  fastify.get(
    '/cost',
    {
      schema: {
        description: [
          'PM cost analysis. Compares estimated cost (estimatedHours × laborRate)',
          'vs actual cost (WO labor + parts) per schedule and per month.',
        ].join(' '),
        tags:     ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from:             { type: 'string', format: 'date-time', description: 'Period start (defaults to 12 months ago)' },
            to:               { type: 'string', format: 'date-time', description: 'Period end (defaults to today)' },
            laborRatePerHour: { type: 'number', minimum: 0.01, description: 'THB/hour for estimated cost (default 500)' },
          },
        },
        response: {
          200: { type: 'object',
            properties: {
              periodStart:        { type: 'string' },
              periodEnd:          { type: 'string' },
              totalEstimatedCost: { type: 'number' },
              totalActualCost:    { type: 'number' },
              totalVariance:      { type: 'number' },
              byMonth:            { type: 'array', items: { type: 'object' } },
              bySchedule:         { type: 'array', items: { type: 'object' } },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised',      ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q       = costQuerySchema.parse(request.query)
      const handler = new GetPMCostHandler(request.db, request.server.prisma)
      const query   = {
        ...(q.from             !== undefined && { from:             q.from }),
        ...(q.to               !== undefined && { to:               q.to }),
        ...(q.laborRatePerHour !== undefined && { laborRatePerHour: q.laborRatePerHour }),
      }
      const result = await handler.handle(query, buildQryCtx(request))
      return reply.send(result)
    },
  )
}

export default analyticsRoutes
