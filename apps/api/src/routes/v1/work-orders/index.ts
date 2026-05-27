/**
 * Work-order CRUD routes — backed by CQRS command + query handlers.
 *
 * GET    /work-orders          → ListWorkOrdersHandler   (all roles)
 * POST   /work-orders          → CreateWorkOrderHandler  (ADMIN, MANAGER, TECHNICIAN)
 * GET    /work-orders/:id      → GetWorkOrderHandler     (all roles)
 * PATCH  /work-orders/:id      → UpdateWorkOrderHandler  (ADMIN, MANAGER; TECHNICIAN description-only)
 * DELETE /work-orders/:id      → CancelWorkOrderHandler  (ADMIN, MANAGER — soft cancel)
 *
 * Sub-resource routes (actions, labor, comments, parts, history) are mounted
 * by their own plugins at the bottom of this file.
 *
 * ## Audit logging
 * Command handlers write `AuditLog` rows internally (before/after state).
 * The route layer does not duplicate those writes.
 *
 * ## Cache invalidation
 * Any mutation (POST, PATCH, DELETE) calls `invalidateListCache` so the
 * 30-second Redis cache for GET / is cleared for this tenant.
 */
import { z } from 'zod'
import type { FastifyPluginAsync, FastifyRequest, FastifySchema } from 'fastify'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import { withTenantFilter } from '../../../lib/tenant-prisma.js'
import {
  CreateWorkOrderHandler,
  UpdateWorkOrderHandler,
  CancelWorkOrderHandler,
} from '../../../application/work-orders/commands/index.js'
import type {
  CommandContext,
  UpdateWorkOrderCommand,
} from '../../../application/work-orders/commands/index.js'
import {
  GetWorkOrderHandler,
  ListWorkOrdersHandler,
  invalidateListCache,
} from '../../../application/work-orders/queries/index.js'
import type {
  QueryContext,
  ListWorkOrdersQuery,
} from '../../../application/work-orders/queries/index.js'
import { PrismaWorkOrderRepository } from '../../../infrastructure/work-orders/index.js'
import aiRoutes from './ai.js'
import analyticsRoutes from './analytics.js'
import actionRoutes from './actions.js'
import laborRoutes from './labor.js'
import commentRoutes from './comments.js'
import partsRoutes from './parts.js'
import historyRoutes from './history.js'
import attachmentRoutes from './attachments.js'

// ── OpenAPI-extended schema type ──────────────────────────────────────────────

/**
 * Fastify's built-in `FastifySchema` type does not include OpenAPI extension
 * fields like `description`, `tags`, and `security` because they require a
 * Swagger/OpenAPI plugin to register the augmentation.  We extend it locally
 * so we can annotate routes without installing a plugin.
 */
type OASSchema = FastifySchema & {
  description?: string
  tags?: string[]
  security?: unknown[]
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

/**
 * Coerce a query-param value that can arrive as a single string or repeated
 * strings into a string array (or undefined when absent).
 */
const stringOrArraySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v): string[] | undefined => {
    if (v === undefined) return undefined
    return Array.isArray(v) ? v : [v]
  })

const listQuerySchema = z.object({
  status: stringOrArraySchema,
  priority: stringOrArraySchema,
  type: stringOrArraySchema,
  assetId: z.string().optional(),
  assigneeId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['createdAt', 'priority', 'dueDate', 'woNumber']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})

const createBodySchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().max(5_000).optional(),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  assetId: z.string().cuid('assetId must be a valid CUID'),
  assigneeIds: z.array(z.string().cuid()).optional(),
  dueDate: z.coerce.date().optional(),
  parentWorkOrderId: z.string().cuid().optional(),
})

/** Full update — ADMIN / MANAGER only. */
const managerUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    dueDate: z.coerce.date().optional(),
    assigneeIds: z.array(z.string().cuid()).optional(),
  })
  .strict()

/** Partial update — TECHNICIAN: description only. */
const technicianUpdateSchema = z
  .object({
    description: z.string().trim().max(5_000).optional(),
  })
  .strict()

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(1_000).default('Cancelled via API'),
})

// ── OpenAPI JSON Schema fragments ─────────────────────────────────────────────

const idParamSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Work order CUID' } },
} as const

const errorSchema = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const

// ── Context builders ──────────────────────────────────────────────────────────

function buildCmdCtx(request: FastifyRequest): CommandContext {
  const ua = request.headers['user-agent']
  return {
    executingUserId: request.user.sub,
    tenantId: request.user.tid,
    userRole: request.user.role,
    ipAddress: request.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  }
}

function buildQryCtx(request: FastifyRequest): QueryContext {
  return {
    executingUserId: request.user.sub,
    tenantId: request.user.tid,
    userRole: request.user.role,
  }
}

/**
 * Build a `ListWorkOrdersQuery` from a parsed Zod result, omitting properties
 * whose values are `undefined` so `exactOptionalPropertyTypes` is satisfied.
 */
function buildListQuery(q: z.infer<typeof listQuerySchema>): ListWorkOrdersQuery {
  const out: ListWorkOrdersQuery = { page: q.page, limit: q.limit, sortDir: q.sortDir }
  if (q.status !== undefined) out.status = q.status
  if (q.priority !== undefined) out.priority = q.priority
  if (q.type !== undefined) out.type = q.type
  if (q.assetId !== undefined) out.assetId = q.assetId
  if (q.assigneeId !== undefined) out.assigneeId = q.assigneeId
  if (q.dateFrom !== undefined) out.dateFrom = q.dateFrom
  if (q.dateTo !== undefined) out.dateTo = q.dateTo
  if (q.search !== undefined) out.search = q.search
  if (q.sortBy !== undefined) out.sortBy = q.sortBy
  if (q.cursor !== undefined) out.cursor = q.cursor
  return out
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const workOrderRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ─────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /work-orders:
   *   get:
   *     summary: List work orders
   *     tags: [work-orders]
   *     security: [{bearerAuth: []}]
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'Paginated, filterable list of work orders for the current tenant.',
        tags: ['work-orders'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'array', items: { type: 'string' } },
            priority: { type: 'array', items: { type: 'string' } },
            type: { type: 'array', items: { type: 'string' } },
            assetId: { type: 'string' },
            assigneeId: { type: 'string' },
            dateFrom: { type: 'string', format: 'date-time' },
            dateTo: { type: 'string', format: 'date-time' },
            search: { type: 'string', maxLength: 200 },
            sortBy: { type: 'string', enum: ['createdAt', 'priority', 'dueDate', 'woNumber'] },
            sortDir: { type: 'string', enum: ['asc', 'desc'] },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  // Allow all properties through — fast-json-stringify strips
                  // unlisted fields by default.
                  additionalProperties: true,
                },
              },
              total: { type: 'integer' },
              nextCursor: { type: 'string', nullable: true },
            },
          },
          401: { description: 'Unauthorised', ...errorSchema },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const parsed = listQuerySchema.parse(request.query)
      const handler = new ListWorkOrdersHandler(
        request.db,
        request.server.prisma,
        request.server.redis,
      )
      const result = await handler.handle(buildListQuery(parsed), buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── POST / ────────────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new work order. Returns the generated ID and WO number.',
        tags: ['work-orders'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['title', 'type', 'priority', 'assetId'],
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            type: { type: 'string', enum: ['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY'] },
            priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
            assetId: { type: 'string' },
            assigneeIds: { type: 'array', items: { type: 'string' } },
            dueDate: { type: 'string', format: 'date-time' },
            parentWorkOrderId: { type: 'string' },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              woNumber: { type: 'string' },
            },
          },
          400: { description: 'Validation error', ...errorSchema },
          401: { description: 'Unauthorised', ...errorSchema },
          403: { description: 'Forbidden', ...errorSchema },
          404: { description: 'Asset not found', ...errorSchema },
          422: { description: 'Business rule error', ...errorSchema },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'create'),
    },
    async (request, reply) => {
      const body = createBodySchema.parse(request.body)
      const woRepo = new PrismaWorkOrderRepository(request.server.prisma, request.server.redis)
      const handler = new CreateWorkOrderHandler(request.db, request.server.prisma, woRepo)

      const createCmd = {
        title: body.title,
        type: body.type,
        priority: body.priority,
        assetId: body.assetId,
      }
      const woId = await handler.handle(
        {
          ...createCmd,
          ...(body.description !== undefined && { description: body.description }),
          ...(body.assigneeIds !== undefined && { assigneeIds: body.assigneeIds }),
          ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
          ...(body.parentWorkOrderId !== undefined && {
            parentWorkOrderId: body.parentWorkOrderId,
          }),
        },
        buildCmdCtx(request),
      )

      // Retrieve WO number generated by the repository (sequential per tenant)
      const created = await request.db.workOrder.findFirst({
        where: { id: woId.value },
        select: { id: true, woNumber: true },
      })

      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(201).send({ id: woId.value, woNumber: created?.woNumber ?? '' })
    },
  )

  // ── GET /:id ──────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description:
          'Full work-order detail: all fields, labor, parts, attachments, comments, and audit trail.',
        tags: ['work-orders'],
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorSchema },
          404: { description: 'Not found', ...errorSchema },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const handler = new GetWorkOrderHandler(request.db, request.server.prisma)
      const detail = await handler.handle({ workOrderId: request.params.id }, buildQryCtx(request))
      return reply.send(detail)
    },
  )

  // ── PATCH /:id ────────────────────────────────────────────────────────────
  // ADMIN / MANAGER: full scalar patch
  // TECHNICIAN:      description-only (role enforced in preHandler; field
  //                  restriction applied in the handler body)
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: [
          'Partial update for a work order.',
          'ADMIN and MANAGER may update title, description, priority, dueDate, and assigneeIds.',
          'TECHNICIAN may update description only.',
          'VIEWER and CONTRACTOR have no update access.',
        ].join(' '),
        tags: ['work-orders'],
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
            dueDate: { type: 'string', format: 'date-time' },
            assigneeIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          400: { description: 'Validation error', ...errorSchema },
          401: { description: 'Unauthorised', ...errorSchema },
          403: { description: 'Forbidden', ...errorSchema },
          404: { description: 'Not found', ...errorSchema },
          422: { description: 'Business rule error', ...errorSchema },
        },
      } as OASSchema,
      preHandler: async (request) => {
        // Manual auth: ADMIN, MANAGER (full update) + TECHNICIAN (description-only).
        // VIEWER and CONTRACTOR have no update access.
        await request.jwtVerify()
        request.db = withTenantFilter(request.server.prisma, request.user.tid)

        const { role } = request.user
        if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'TECHNICIAN') {
          throw new DomainException(`Forbidden: ${role} cannot update work-order`, 'FORBIDDEN', 403)
        }
      },
    },
    async (request, reply) => {
      const isTech = request.user.role === 'TECHNICIAN'
      const rawBody = request.body

      // Build the command, scoping fields by role
      const updateCmd: UpdateWorkOrderCommand = { workOrderId: request.params.id }

      if (isTech) {
        const dto = technicianUpdateSchema.parse(rawBody)
        if (dto.description !== undefined) updateCmd.description = dto.description
      } else {
        const dto = managerUpdateSchema.parse(rawBody)
        if (dto.title !== undefined) updateCmd.title = dto.title
        if (dto.description !== undefined) updateCmd.description = dto.description
        if (dto.priority !== undefined) updateCmd.priority = dto.priority
        if (dto.dueDate !== undefined) updateCmd.dueDate = dto.dueDate
        if (dto.assigneeIds !== undefined) updateCmd.assigneeIds = dto.assigneeIds
      }

      const woRepo = new PrismaWorkOrderRepository(request.server.prisma, request.server.redis)
      const handler = new UpdateWorkOrderHandler(request.db, request.server.prisma, woRepo)
      await handler.handle(updateCmd, buildCmdCtx(request))

      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  // Soft delete = cancel.  Accepts optional JSON body with { reason? }.
  // COMPLETED WOs cannot be cancelled (domain throws CANNOT_CANCEL_COMPLETED → 422).
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Soft-delete (cancel) a work order. COMPLETED WOs cannot be cancelled.',
        tags: ['work-orders'],
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorSchema },
          403: { description: 'Forbidden', ...errorSchema },
          404: { description: 'Not found', ...errorSchema },
          422: { description: 'Business rule error', ...errorSchema },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'cancel'),
    },
    async (request, reply) => {
      // Body is optional — fall back to a sensible default when none is sent
      const body = cancelBodySchema.parse(request.body ?? {})
      const woRepo = new PrismaWorkOrderRepository(request.server.prisma, request.server.redis)
      const handler = new CancelWorkOrderHandler(request.db, request.server.prisma, woRepo)

      await handler.handle(
        { workOrderId: request.params.id, reason: body.reason },
        buildCmdCtx(request),
      )

      await invalidateListCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── Static-path plugins (registered first so /ai, /metrics, /calendar are
  //    matched before the dynamic /:id routes) ────────────────────────────────
  void fastify.register(aiRoutes)
  void fastify.register(analyticsRoutes)

  // ── Sub-resource plugins ──────────────────────────────────────────────────
  void fastify.register(actionRoutes)
  void fastify.register(laborRoutes)
  void fastify.register(commentRoutes)
  void fastify.register(partsRoutes)
  void fastify.register(historyRoutes)
  void fastify.register(attachmentRoutes)
}

export default workOrderRoutes
