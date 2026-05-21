/**
 * Asset lifecycle action routes.
 *
 * POST /:id/status       — change status (MANAGER/ADMIN)
 * POST /:id/decommission — decommission (ADMIN only)
 * POST /:id/transfer     — change location/parent (MANAGER/ADMIN)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import {
  ChangeAssetStatusHandler,
  DecommissionAssetHandler,
  TransferAssetHandler,
} from '../../../application/assets/commands/index.js'
import { AssetSearchSyncService } from '../../../application/assets/queries/index.js'
import {
  buildCmdCtx,
  makeAssetRepo,
  assetIdParam,
  errorBody,
  invalidateAssetTreeCache,
} from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const statusBodySchema = z.object({
  newStatus: z.enum(['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE']),
  reason: z.string().trim().max(1_000).optional(),
  linkedWorkOrder: z
    .object({
      title: z.string().trim().min(1).max(200),
      type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']).optional(),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
      description: z.string().trim().max(5_000).optional(),
    })
    .optional(),
})

const decommissionBodySchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1_000),
  authorizedBy: z.string().trim().optional(),
})

const transferBodySchema = z.object({
  newLocationId: z.string().cuid('newLocationId must be a valid CUID'),
  newParentId: z.string().cuid().nullable().optional(),
})

// ── Plugin ────────────────────────────────────────────────────────────────────

const actionRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /:id/status ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/status',
    {
      schema: {
        description: [
          'Change asset lifecycle status.',
          'Valid transitions: OPERATIONAL ↔ STANDBY ↔ UNDER_MAINTENANCE.',
          'Use /decommission to permanently decommission.',
          'When transitioning to UNDER_MAINTENANCE, optionally creates a linked work order.',
        ].join(' '),
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        body: {
          type: 'object',
          required: ['newStatus'],
          properties: {
            newStatus: { type: 'string', enum: ['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE'] },
            reason: { type: 'string', maxLength: 1000 },
            linkedWorkOrder: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                type: { type: 'string' },
                priority: { type: 'string' },
              },
            },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
          422: { description: 'Invalid transition', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'update'),
    },
    async (request, reply) => {
      const body = statusBodySchema.parse(request.body)
      const repo = makeAssetRepo(request)
      const ctx = buildCmdCtx(request)
      const handler = new ChangeAssetStatusHandler(request.db, request.server.prisma, repo)

      // exactOptionalPropertyTypes: build cmd imperatively
      type Cmd = Parameters<typeof handler.handle>[0]
      const cmd: Cmd = { assetId: request.params.id, newStatus: body.newStatus }
      if (body.reason !== undefined) cmd.reason = body.reason
      if (body.linkedWorkOrder !== undefined) {
        const lwo = body.linkedWorkOrder
        cmd.linkedWorkOrder = { title: lwo.title }
        if (lwo.type !== undefined) cmd.linkedWorkOrder.type = lwo.type
        if (lwo.priority !== undefined) cmd.linkedWorkOrder.priority = lwo.priority
        if (lwo.description !== undefined) cmd.linkedWorkOrder.description = lwo.description
      }
      await handler.handle(cmd, ctx)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── POST /:id/decommission ─────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/decommission',
    {
      schema: {
        description: [
          'Permanently decommission an asset.',
          'ADMIN only. Blocked when any open work orders exist.',
          'Cascades: deactivates all PM schedules for the asset.',
        ].join(' '),
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            authorizedBy: { type: 'string' },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
          409: { description: 'Open work orders exist', ...errorBody },
          422: { description: 'Already decommissioned', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'delete'), // ADMIN only
    },
    async (request, reply) => {
      const body = decommissionBodySchema.parse(request.body)
      const repo = makeAssetRepo(request)
      const ctx = buildCmdCtx(request)
      const handler = new DecommissionAssetHandler(request.db, request.server.prisma, repo)

      await handler.handle(
        {
          assetId: request.params.id,
          reason: body.reason,
          authorizedBy: body.authorizedBy ?? request.user.sub,
        },
        ctx,
      )

      // Remove from search index
      const sync = new AssetSearchSyncService(request.server.search)
      void sync.deleteDocument(request.params.id, request.user.tid).catch(() => undefined)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── POST /:id/transfer ─────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/transfer',
    {
      schema: {
        description: [
          'Transfer an asset to a new location.',
          'Optionally re-parents the asset in the hierarchy.',
          'Pass newParentId: null to detach from current parent (make root).',
        ].join(' '),
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        body: {
          type: 'object',
          required: ['newLocationId'],
          properties: {
            newLocationId: { type: 'string' },
            newParentId: { type: 'string', nullable: true },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Asset or location not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'update'),
    },
    async (request, reply) => {
      const body = transferBodySchema.parse(request.body)
      const repo = makeAssetRepo(request)
      const ctx = buildCmdCtx(request)
      const handler = new TransferAssetHandler(request.db, request.server.prisma, repo)

      const cmd = {
        assetId: request.params.id,
        newLocationId: body.newLocationId,
        ...(body.newParentId !== undefined && { newParentId: body.newParentId }),
      }
      await handler.handle(cmd, ctx)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )
}

export default actionRoutes
