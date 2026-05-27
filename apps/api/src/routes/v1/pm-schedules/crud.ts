/**
 * PM-schedule CRUD + collection routes.
 *
 * Static paths MUST be registered before dynamic /:id routes so Fastify's
 * radix router does not swallow /calendar, /upcoming, etc. as IDs.
 *
 * Route map (all under /pm-schedules prefix):
 *
 *   GET    /                 list with filters + pagination
 *   POST   /                 create schedule
 *   GET    /calendar         calendar view (registered before /:id)
 *   GET    /upcoming         upcoming due list
 *   GET    /compliance       compliance report
 *   GET    /cost             cost analysis
 *   POST   /ai/suggest       AI-generated schedule suggestions
 *   GET    /:id              detail with task list + trigger history
 *   PATCH  /:id              update mutable fields
 *   DELETE /:id              deactivate (soft — no hard delete)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import type { TaskProps } from '@maintainhub/domain'
import { requirePermission } from '../../../middleware/require-permission.js'
import { DomainException } from '../../../errors/domain.exception.js'
import {
  CreatePMScheduleHandler,
  UpdatePMScheduleHandler,
  DeactivatePMScheduleHandler,
} from '../../../application/pm-schedules/commands/index.js'
import { ListPMSchedulesHandler } from '../../../application/pm-schedules/queries/index.js'
import { GeneratePMScheduleFromAssetType } from '../../../application/pm-schedules/ai/index.js'
import { AiError } from '../../../application/work-orders/ai/ai.types.js'
import { buildCmdCtx, buildQryCtx, makePMRepo, idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'
import actionRoutes from './actions.js'
import analyticsRoutes from './analytics.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const calendarRuleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
    interval: z.number().int().positive(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .optional()

const meterRuleSchema = z
  .object({
    meterField: z.string().trim().min(1),
    interval: z.number().positive(),
    tolerance: z.number().min(0).max(100),
  })
  .optional()

const taskSchema = z.object({
  sequence: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(5_000).default(''),
  requiresPhoto: z.boolean().default(false),
  requiresMeterReading: z.boolean().default(false),
  meterReadingUnit: z.string().trim().max(50).optional(),
  estimatedMinutes: z.number().int().nonnegative().default(0),
  isCritical: z.boolean().default(false),
})

const createBodySchema = z.object({
  assetId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
  type: z.enum(['CALENDAR', 'METER', 'CONDITION']),
  calendarRule: calendarRuleSchema,
  meterRule: meterRuleSchema,
  conditionRule: z.record(z.unknown()).optional(),
  taskList: z.array(taskSchema).min(1, 'At least one task is required'),
  estimatedHours: z.number().nonnegative().optional(),
  requiredSkillIds: z.array(z.string()).optional(),
  defaultAssigneeIds: z.array(z.string()).optional(),
  advanceNoticeDays: z.number().int().min(0).max(90).optional(),
})

const updateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    calendarRule: z.union([calendarRuleSchema, z.null()]),
    meterRule: z.union([meterRuleSchema, z.null()]),
    taskList: z.array(taskSchema).min(1).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    requiredSkillIds: z.array(z.string()).optional(),
    defaultAssigneeIds: z.array(z.string()).optional(),
    advanceNoticeDays: z.number().int().min(0).max(90).optional(),
  })
  .strict()

const listQuerySchema = z.object({
  assetId: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  triggerType: z.enum(['CALENDAR', 'METER', 'CONDITION']).optional(),
  nextDueBefore: z.coerce.date().optional(),
  nextDueAfter: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Zod-parsed task to the domain TaskProps shape.
 *  With exactOptionalPropertyTypes, `meterReadingUnit` must always be present
 *  (even as undefined) in TaskProps, but Zod's .optional() may omit the key.
 *  We explicitly include it here to satisfy the type checker.
 */
function toTaskProps(t: z.infer<typeof taskSchema>): TaskProps {
  return {
    sequence: t.sequence,
    title: t.title,
    instructions: t.instructions,
    requiresPhoto: t.requiresPhoto,
    requiresMeterReading: t.requiresMeterReading,
    meterReadingUnit: t.meterReadingUnit !== undefined ? t.meterReadingUnit : undefined,
    estimatedMinutes: t.estimatedMinutes,
    isCritical: t.isCritical,
  }
}

/** Strip undefined optional fields from a parsed calendarRule so it satisfies
 *  exactOptionalPropertyTypes (keys with optional values must be absent, not
 *  present-with-undefined, in the target type).
 */
function toCalendarRuleInput(r: NonNullable<z.infer<typeof calendarRuleSchema>>): {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  month?: number
} {
  return {
    frequency: r.frequency,
    interval: r.interval,
    ...(r.dayOfWeek !== undefined && { dayOfWeek: r.dayOfWeek }),
    ...(r.dayOfMonth !== undefined && { dayOfMonth: r.dayOfMonth }),
    ...(r.month !== undefined && { month: r.month }),
  }
}

const aiSuggestBodySchema = z.object({
  assetType: z.string().trim().min(1).max(200),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
})

// ── Plugin ────────────────────────────────────────────────────────────────────

const pmCrudRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Static collection routes (MUST come before /:id) ────────────────────────
  // These are registered by the analyticsRoutes plugin; we register it early.
  void fastify.register(analyticsRoutes)
  void fastify.register(actionRoutes)

  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: {
        description: 'List PM schedules. Filter by assetId, isActive, triggerType, nextDue window.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            isActive: { type: 'string', enum: ['true', 'false'] },
            triggerType: { type: 'string', enum: ['CALENDAR', 'METER', 'CONDITION'] },
            nextDueBefore: { type: 'string', format: 'date-time' },
            nextDueAfter: { type: 'string', format: 'date-time' },
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
              nextCursor: { type: 'string', nullable: true },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q = listQuerySchema.parse(request.query)
      const handler = new ListPMSchedulesHandler(request.db, request.server.prisma)
      const query = {
        limit: q.limit,
        ...(q.assetId !== undefined && { assetId: q.assetId }),
        ...(q.isActive !== undefined && { isActive: q.isActive }),
        ...(q.triggerType !== undefined && { triggerType: q.triggerType }),
        ...(q.nextDueBefore !== undefined && { nextDueBefore: q.nextDueBefore }),
        ...(q.nextDueAfter !== undefined && { nextDueAfter: q.nextDueAfter }),
        ...(q.cursor !== undefined && { cursor: q.cursor }),
      }
      const result = await handler.handle(query, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── POST / ────────────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: {
        description:
          'Create a new PM schedule with tasks. Initial nextDueAt is computed automatically for CALENDAR type.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['assetId', 'title', 'type', 'taskList'],
          properties: {
            assetId: { type: 'string' },
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            type: { type: 'string', enum: ['CALENDAR', 'METER', 'CONDITION'] },
            calendarRule: { type: 'object', additionalProperties: true },
            meterRule: { type: 'object', additionalProperties: true },
            conditionRule: { type: 'object', additionalProperties: true },
            taskList: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
              minItems: 1,
            },
            estimatedHours: { type: 'number', minimum: 0 },
            requiredSkillIds: { type: 'array', items: { type: 'string' } },
            defaultAssigneeIds: { type: 'array', items: { type: 'string' } },
            advanceNoticeDays: { type: 'integer', minimum: 0, maximum: 90 },
          },
          additionalProperties: false,
        },
        response: {
          201: { type: 'object', properties: { id: { type: 'string' } } },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Asset not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'create'),
    },
    async (request, reply) => {
      const body = createBodySchema.parse(request.body)
      const repo = makePMRepo(request)
      const handler = new CreatePMScheduleHandler(request.db, request.server.prisma, repo)

      const id = await handler.handle(
        {
          assetId: body.assetId,
          title: body.title,
          type: body.type,
          taskList: body.taskList.map(toTaskProps),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.calendarRule !== undefined && {
            calendarRule: toCalendarRuleInput(body.calendarRule),
          }),
          ...(body.meterRule !== undefined && { meterRule: body.meterRule }),
          ...(body.conditionRule !== undefined && { conditionRule: body.conditionRule }),
          ...(body.estimatedHours !== undefined && { estimatedHours: body.estimatedHours }),
          ...(body.requiredSkillIds !== undefined && { requiredSkillIds: body.requiredSkillIds }),
          ...(body.defaultAssigneeIds !== undefined && {
            defaultAssigneeIds: body.defaultAssigneeIds,
          }),
          ...(body.advanceNoticeDays !== undefined && {
            advanceNoticeDays: body.advanceNoticeDays,
          }),
        },
        buildCmdCtx(request),
      )

      return reply.status(201).send({ id })
    },
  )

  // ── POST /ai/suggest ──────────────────────────────────────────────────────
  // Static path — registered before /:id to avoid param capture.
  fastify.post(
    '/ai/suggest',
    {
      schema: {
        description: [
          'Use Claude to generate a set of suggested PM schedules for an asset type.',
          'Returns draft schedules for user review — nothing is saved automatically.',
        ].join(' '),
        tags: ['pm-schedules', 'ai'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['assetType'],
          properties: {
            assetType: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              description: 'e.g. "Centrifugal Pump"',
            },
            manufacturer: { type: 'string', maxLength: 200 },
            model: { type: 'string', maxLength: 200 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              schedules: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          503: { description: 'AI unavailable', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'create'),
    },
    async (request, reply) => {
      if (!request.server.openrouter) {
        throw new DomainException('AI service not configured', 'AI_UNAVAILABLE', 503)
      }

      const body = aiSuggestBodySchema.parse(request.body)

      const useCase = new GeneratePMScheduleFromAssetType(request.server.openrouter)

      try {
        const result = await useCase.execute({
          assetType: body.assetType,
          ...(body.manufacturer !== undefined && { manufacturer: body.manufacturer }),
          ...(body.model !== undefined && { model: body.model }),
        })
        return await reply.send(result)
      } catch (err) {
        if (err instanceof AiError) {
          throw new DomainException(err.message, err.code, err.statusCode)
        }
        throw err
      }
    },
  )

  // ── GET /:id ──────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description:
          'Full PM schedule detail: task list, calendarRule/meterRule, and trigger history from the audit log.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const { id } = request.params
      const tenantId = request.user.tid

      const row = await request.db.pMSchedule.findFirst({
        where: { id, tenantId },
      })

      if (!row) {
        throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
      }

      // Load trigger history from AuditLog (most recent 50 manual + scheduler triggers)
      const triggerHistory = await request.server.prisma.auditLog.findMany({
        where: {
          tenantId,
          action: { in: ['MANUAL_TRIGGER_PM', 'CREATE_WORK_ORDER'] },
          entityType: { in: ['PMSchedule', 'WorkOrder'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { entityId: true, action: true, after: true, userId: true, createdAt: true },
      })

      // Filter to triggers for this schedule (entityId match or pmScheduleId in after JSON)
      const relevantTriggers = triggerHistory.filter((t) => {
        if (t.entityId === id) return true
        const after = t.after as Record<string, unknown> | null
        return after?.pmScheduleId === id
      })

      return reply.send({
        ...row,
        // Map DB column names to domain names for consistency
        type: row.triggerType,
        lastTriggeredAt: row.lastTriggered?.toISOString() ?? null,
        nextDueAt: row.nextDue?.toISOString() ?? null,
        triggerHistory: relevantTriggers.map((t) => ({
          action: t.action,
          entityId: t.entityId,
          after: t.after,
          userId: t.userId,
          triggeredAt: t.createdAt.toISOString(),
        })),
      })
    },
  )

  // ── PATCH /:id ────────────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description:
          'Update mutable PM schedule fields. When calendarRule changes, nextDueAt is recomputed.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            calendarRule: { type: 'object', nullable: true },
            meterRule: { type: 'object', nullable: true },
            taskList: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
              minItems: 1,
            },
            estimatedHours: { type: 'number', minimum: 0 },
            requiredSkillIds: { type: 'array', items: { type: 'string' } },
            defaultAssigneeIds: { type: 'array', items: { type: 'string' } },
            advanceNoticeDays: { type: 'integer', minimum: 0, maximum: 90 },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const body = updateBodySchema.parse(request.body)
      const repo = makePMRepo(request)
      const handler = new UpdatePMScheduleHandler(request.server.prisma, repo)

      await handler.handle(
        {
          id: request.params.id,
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.calendarRule !== undefined && {
            calendarRule:
              body.calendarRule !== null ? toCalendarRuleInput(body.calendarRule) : null,
          }),
          ...(body.meterRule !== undefined && { meterRule: body.meterRule }),
          ...(body.taskList !== undefined && { taskList: body.taskList.map(toTaskProps) }),
          ...(body.estimatedHours !== undefined && { estimatedHours: body.estimatedHours }),
          ...(body.requiredSkillIds !== undefined && { requiredSkillIds: body.requiredSkillIds }),
          ...(body.defaultAssigneeIds !== undefined && {
            defaultAssigneeIds: body.defaultAssigneeIds,
          }),
          ...(body.advanceNoticeDays !== undefined && {
            advanceNoticeDays: body.advanceNoticeDays,
          }),
        },
        buildCmdCtx(request),
      )

      return reply.status(204).send()
    },
  )

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  // Soft delete = deactivate.  No hard deletion of PM schedules.
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description:
          'Deactivate a PM schedule (soft delete). Existing WOs created from this schedule are unaffected.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'delete'),
    },
    async (request, reply) => {
      const repo = makePMRepo(request)
      const handler = new DeactivatePMScheduleHandler(request.server.prisma, repo)
      await handler.handle({ id: request.params.id }, buildCmdCtx(request))
      return reply.status(204).send()
    },
  )
}

export default pmCrudRoutes
