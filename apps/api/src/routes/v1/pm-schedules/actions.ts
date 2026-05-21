/**
 * PM-schedule lifecycle action routes.
 *
 * POST /:id/activate   — INACTIVE → ACTIVE, recomputes nextDueAt
 * POST /:id/deactivate — ACTIVE → INACTIVE
 * POST /:id/trigger    — immediate manual trigger → creates WO
 * POST /:id/clone      — copy to another asset
 * POST /:id/tasks      — add a task to an existing schedule
 * DELETE /:id/tasks/:seq — remove a task by sequence
 * PUT /:id/tasks/order — reorder tasks
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import type { TaskProps } from '@maintainhub/domain'
import { requirePermission } from '../../../middleware/require-permission.js'
import {
  ActivatePMScheduleHandler,
  DeactivatePMScheduleHandler,
  ManualTriggerPMHandler,
  CloneScheduleHandler,
  AddTaskToScheduleHandler,
  RemoveTaskHandler,
  ReorderTasksHandler,
} from '../../../application/pm-schedules/commands/index.js'
import { buildCmdCtx, makePMRepo, idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const cloneBodySchema = z.object({
  targetAssetId: z.string().min(1, 'targetAssetId is required'),
  title: z.string().trim().max(200).optional(),
})

const triggerBodySchema = z.object({
  assigneeIds: z.array(z.string()).optional(),
})

const addTaskBodySchema = z.object({
  sequence: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(5_000).default(''),
  requiresPhoto: z.boolean().default(false),
  requiresMeterReading: z.boolean().default(false),
  meterReadingUnit: z.string().trim().max(50).optional(),
  estimatedMinutes: z.number().int().nonnegative().default(0),
  isCritical: z.boolean().default(false),
})

const reorderBodySchema = z.object({
  orderedTitles: z.array(z.string()).min(1),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTaskProps(t: z.infer<typeof addTaskBodySchema>): TaskProps {
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

// ── Generics ──────────────────────────────────────────────────────────────────

type IdParam = { Params: { id: string } }
type IdSeqParam = { Params: { id: string; seq: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const actionRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /:id/activate ────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/activate',
    {
      schema: {
        description: 'Activate a PM schedule. Recomputes nextDueAt from today for CALENDAR type.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule not found', ...errorBody },
          422: { description: 'Already active', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const repo = makePMRepo(request)
      const handler = new ActivatePMScheduleHandler(request.server.prisma, repo)
      await handler.handle({ id: request.params.id }, buildCmdCtx(request))
      return reply.status(204).send()
    },
  )

  // ── POST /:id/deactivate ──────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/deactivate',
    {
      schema: {
        description: 'Deactivate a PM schedule. The scheduler will skip it until re-activated.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule not found', ...errorBody },
          422: { description: 'Already inactive', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const repo = makePMRepo(request)
      const handler = new DeactivatePMScheduleHandler(request.server.prisma, repo)
      await handler.handle({ id: request.params.id }, buildCmdCtx(request))
      return reply.status(204).send()
    },
  )

  // ── POST /:id/trigger ─────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/trigger',
    {
      schema: {
        description: [
          'Manually trigger a PM schedule — creates a PREVENTIVE work order immediately',
          'and advances lastTriggeredAt / nextDueAt.',
        ].join(' '),
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            assigneeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Override assignees; defaults to schedule.defaultAssigneeIds',
            },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              workOrderId: { type: 'string' },
              woNumber: { type: 'string' },
              nextDueAt: { type: 'string', nullable: true },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule not found', ...errorBody },
          422: { description: 'Schedule inactive', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'trigger'),
    },
    async (request, reply) => {
      const body = triggerBodySchema.parse(request.body ?? {})
      const repo = makePMRepo(request)
      const handler = new ManualTriggerPMHandler(request.server.prisma, repo)

      const result = await handler.handle(
        {
          id: request.params.id,
          ...(body.assigneeIds !== undefined && { assigneeIds: body.assigneeIds }),
        },
        buildCmdCtx(request),
      )

      return reply.status(201).send(result)
    },
  )

  // ── POST /:id/clone ───────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/clone',
    {
      schema: {
        description: [
          'Clone a PM schedule to a different asset.',
          'The clone copies all tasks and rules; starts inactive with no lastTriggeredAt.',
        ].join(' '),
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: 'object',
          required: ['targetAssetId'],
          properties: {
            targetAssetId: { type: 'string', description: 'Asset CUID to clone the schedule to' },
            title: {
              type: 'string',
              maxLength: 200,
              description: 'Override title (defaults to "{original} (Copy)")',
            },
          },
          additionalProperties: false,
        },
        response: {
          201: { type: 'object', properties: { id: { type: 'string' } } },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Source/target not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'create'),
    },
    async (request, reply) => {
      const body = cloneBodySchema.parse(request.body)
      const repo = makePMRepo(request)
      const handler = new CloneScheduleHandler(request.db, request.server.prisma, repo)

      const id = await handler.handle(
        {
          sourceId: request.params.id,
          targetAssetId: body.targetAssetId,
          ...(body.title !== undefined && { title: body.title }),
        },
        buildCmdCtx(request),
      )

      return reply.status(201).send({ id })
    },
  )

  // ── POST /:id/tasks ───────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/tasks',
    {
      schema: {
        description: 'Add a task to an existing PM schedule.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: 'object',
          required: ['sequence', 'title'],
          properties: {
            sequence: { type: 'integer', minimum: 1 },
            title: { type: 'string', minLength: 1, maxLength: 200 },
            instructions: { type: 'string', maxLength: 5000 },
            requiresPhoto: { type: 'boolean' },
            requiresMeterReading: { type: 'boolean' },
            meterReadingUnit: { type: 'string', maxLength: 50 },
            estimatedMinutes: { type: 'integer', minimum: 0 },
            isCritical: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule not found', ...errorBody },
          422: { description: 'Duplicate sequence number', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const task = addTaskBodySchema.parse(request.body)
      const repo = makePMRepo(request)
      const handler = new AddTaskToScheduleHandler(request.server.prisma, repo)

      await handler.handle(
        {
          scheduleId: request.params.id,
          task: toTaskProps(task),
        },
        buildCmdCtx(request),
      )

      return reply.status(204).send()
    },
  )

  // ── DELETE /:id/tasks/:seq ────────────────────────────────────────────────
  fastify.delete<IdSeqParam>(
    '/:id/tasks/:seq',
    {
      schema: {
        description: 'Remove a task from a PM schedule by sequence number.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'seq'],
          properties: {
            id: { type: 'string' },
            seq: { type: 'string', description: 'Task sequence number' },
          },
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule or task not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const seq = Number.parseInt(request.params.seq, 10)
      const repo = makePMRepo(request)
      const handler = new RemoveTaskHandler(request.server.prisma, repo)

      await handler.handle({ scheduleId: request.params.id, sequence: seq }, buildCmdCtx(request))
      return reply.status(204).send()
    },
  )

  // ── PUT /:id/tasks/order ─────────────────────────────────────────────────
  fastify.put<IdParam>(
    '/:id/tasks/order',
    {
      schema: {
        description:
          'Reorder tasks by supplying task titles in the desired order. Sequence numbers are reassigned starting at 1.',
        tags: ['pm-schedules'],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: 'object',
          required: ['orderedTitles'],
          properties: {
            orderedTitles: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Task titles in the desired display order',
            },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Schedule not found', ...errorBody },
          422: { description: 'Mismatch or unknown title', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'update'),
    },
    async (request, reply) => {
      const body = reorderBodySchema.parse(request.body)
      const repo = makePMRepo(request)
      const handler = new ReorderTasksHandler(request.server.prisma, repo)

      await handler.handle(
        {
          scheduleId: request.params.id,
          orderedTitles: body.orderedTitles,
        },
        buildCmdCtx(request),
      )

      return reply.status(204).send()
    },
  )
}

export default actionRoutes
