/**
 * Asset CRUD routes + collection-level queries.
 *
 * GET  /                — list with filters + pagination  (all roles)
 * GET  /tree            — full hierarchy tree            (all roles, Redis 1 min cache)
 * GET  /attention       — assets needing attention       (MANAGER/ADMIN)
 * GET  /search          — Meilisearch full-text          (all roles)
 * GET  /by-location     — assets grouped by location     (all roles)
 * GET  /:id             — full detail                    (all roles)
 * POST /                — create                         (MANAGER/ADMIN)
 * PATCH /:id            — update fields                  (MANAGER/ADMIN)
 * DELETE /:id           — soft delete                    (ADMIN)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import type { Asset } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import {
  CreateAssetHandler,
  UpdateAssetHandler,
} from '../../../application/assets/commands/index.js'
import {
  GetAssetHandler,
  GetAssetTreeHandler,
  GetAssetsByLocationHandler,
  GetAssetsNeedingAttentionHandler,
  SearchAssetsHandler,
  AssetSearchSyncService,
} from '../../../application/assets/queries/index.js'
import {
  buildCmdCtx,
  buildQryCtx,
  makeAssetRepo,
  assetIdParam,
  errorBody,
  assetTreeCacheKey,
  treeGet,
  treeSet,
  invalidateAssetTreeCache,
} from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── DTO projection ────────────────────────────────────────────────────────────

/**
 * Convert a domain `Asset` (with value-object properties) to a plain JSON-
 * serialisable DTO. This prevents fast-json-stringify from emitting `{ value: "…" }`
 * for AssetId, AssetNumber, AssetStatus, etc.
 */
function assetToDto(a: Asset): Record<string, unknown> {
  return {
    id: a.id.value,
    assetNumber: a.assetNumber.value,
    name: a.name,
    description: a.description ?? null,
    status: a.status.value,
    criticality: a.criticality.value,
    categoryId: a.categoryId,
    locationId: a.locationId ?? null,
    parentId: a.parentId?.value ?? null,
    manufacturer: a.manufacturer ?? null,
    model: a.model ?? null,
    serialNumber: a.serialNumber ?? null,
    installDate: a.installDate?.toISOString() ?? null,
    warrantyExpiry: a.warrantyExpiry?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt?.toISOString() ?? null,
  }
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const stringOrArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v): string[] | undefined => {
    if (v === undefined) return undefined
    return Array.isArray(v) ? v : [v]
  })

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: stringOrArray,
  criticality: stringOrArray,
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  parentId: z.string().optional(),
  hasOpenWOs: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().cuid(),
  criticality: z.enum(['A', 'B', 'C', 'D']),
  installDate: z.coerce.date(),
  description: z.string().trim().max(5_000).optional(),
  locationId: z.string().cuid().optional(),
  parentId: z.string().cuid().optional(),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  warrantyExpiry: z.coerce.date().optional(),
  customFields: z.record(z.unknown()).optional(),
})

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    manufacturer: z.string().trim().max(200).optional(),
    model: z.string().trim().max(200).optional(),
    serialNumber: z.string().trim().max(100).optional(),
    warrantyExpiry: z.coerce.date().nullable().optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .strict()

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  filter: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const treeQuerySchema = z.object({
  rootAssetId: z.string().cuid().optional(),
  includeStats: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

const attentionQuerySchema = z.object({
  warrantyWarningDays: z.coerce.number().int().min(1).default(30),
  highMttrThresholdHours: z.coerce.number().min(0).default(24),
  mttrLookbackDays: z.coerce.number().int().min(1).default(90),
})

// ── Internal helper (defined before plugin to satisfy no-use-before-define) ─

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncToSearch(request: any, assetId: string): Promise<void> {
  const row = await request.server.prisma.asset.findFirst({
    where: { id: assetId },
    select: {
      id: true,
      tenantId: true,
      assetNumber: true,
      name: true,
      serialNumber: true,
      manufacturer: true,
      model: true,
      status: true,
      criticality: true,
      categoryId: true,
      locationId: true,
      parentId: true,
      updatedAt: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
      parent: { select: { name: true } },
    },
  })
  if (!row) return
  const sync = new AssetSearchSyncService(request.server.search)
  await sync.upsertDocument(AssetSearchSyncService.buildDocument(row))
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const crudRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: {
        description: 'Paginated asset list with optional filters.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            status: { type: 'array', items: { type: 'string' } },
            criticality: { type: 'array', items: { type: 'string' } },
            categoryId: { type: 'string' },
            locationId: { type: 'string' },
            parentId: { type: 'string' },
            hasOpenWOs: { type: 'string', enum: ['true', 'false'] },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = listQuerySchema.parse(request.query)
      const repo = makeAssetRepo(request)
      const filters = {
        page: q.page,
        limit: q.limit,
        ...(q.search !== undefined && { search: q.search }),
        ...(q.status !== undefined && { status: q.status }),
        ...(q.criticality !== undefined && { criticality: q.criticality }),
        ...(q.categoryId !== undefined && { categoryId: q.categoryId }),
        ...(q.locationId !== undefined && { locationId: q.locationId }),
        ...(q.parentId !== undefined && { parentId: q.parentId }),
        ...(q.hasOpenWOs !== undefined && { hasOpenWOs: q.hasOpenWOs }),
      }
      const result = await repo.findByFilters(filters, request.user.tid)
      // Project domain objects → plain DTOs before serialization
      return reply.send({ items: result.items.map(assetToDto), total: result.total })
    },
  )

  // ── GET /tree ─────────────────────────────────────────────────────────────
  // Registered BEFORE /:id so /tree is not captured by the param route.
  fastify.get(
    '/tree',
    {
      schema: {
        description: 'Full asset hierarchy tree. Cached in Redis for 60 s.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            rootAssetId: { type: 'string' },
            includeStats: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = treeQuerySchema.parse(request.query)
      const key = assetTreeCacheKey(request.user.tid, q.rootAssetId)

      const cached = await treeGet(request.server.redis, key)
      if (cached !== null) return reply.send(cached)

      const handler = new GetAssetTreeHandler(request.db, request.server.prisma)
      const query = {
        ...(q.rootAssetId !== undefined && { rootAssetId: q.rootAssetId }),
        ...(q.includeStats !== undefined && { includeStats: q.includeStats }),
      }
      const result = await handler.handle(query, buildQryCtx(request))
      await treeSet(request.server.redis, key, result)
      return reply.send(result)
    },
  )

  // ── GET /attention ─────────────────────────────────────────────────────────
  fastify.get(
    '/attention',
    {
      schema: {
        description:
          'Assets needing attention: overdue PM, expiring warranty, open emergency WO, high MTTR.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            warrantyWarningDays: { type: 'integer', default: 30 },
            highMttrThresholdHours: { type: 'number', default: 24 },
            mttrLookbackDays: { type: 'integer', default: 90 },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = attentionQuerySchema.parse(request.query)
      const handler = new GetAssetsNeedingAttentionHandler(request.db, request.server.prisma)
      const result = await handler.handle(q, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /search ────────────────────────────────────────────────────────────
  fastify.get(
    '/search',
    {
      schema: {
        description:
          'Full-text asset search via Meilisearch. Falls back to empty result when search is unavailable.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1 },
            filter: { type: 'string' },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = searchQuerySchema.parse(request.query)
      const handler = new SearchAssetsHandler(request.server.search, request.db)
      const searchQuery = {
        q: q.q,
        limit: q.limit,
        offset: q.offset,
        ...(q.filter !== undefined && { filter: q.filter }),
      }
      const result = await handler.handle(searchQuery, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /by-location ───────────────────────────────────────────────────────
  fastify.get(
    '/by-location',
    {
      schema: {
        description: 'Assets grouped by location for floor plan view.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            rootLocationId: { type: 'string' },
            activeOnly: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const qs = request.query as Record<string, string>
      const handler = new GetAssetsByLocationHandler(request.db, request.server.prisma)
      const query = {
        ...(qs.rootLocationId !== undefined && { rootLocationId: qs.rootLocationId }),
        ...(qs.activeOnly !== undefined && { activeOnly: qs.activeOnly === 'true' }),
      }
      const result = await handler.handle(query, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── GET /:id ───────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description:
          'Full asset detail: fields, parent, children, PM schedules, recent WOs, documents with signed URLs, metrics.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const handler = new GetAssetHandler(
        request.db,
        request.server.prisma,
        request.server.minio,
        request.server.minioBucket,
      )
      const result = await handler.handle({ assetId: request.params.id }, buildQryCtx(request))
      return reply.send(result)
    },
  )

  // ── POST / ─────────────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new asset. Generates a sequential AST-NNNNNN asset number.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'categoryId', 'criticality', 'installDate'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            categoryId: { type: 'string' },
            criticality: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
            installDate: { type: 'string', format: 'date-time' },
            description: { type: 'string', maxLength: 5000 },
            locationId: { type: 'string' },
            parentId: { type: 'string' },
            manufacturer: { type: 'string', maxLength: 200 },
            model: { type: 'string', maxLength: 200 },
            serialNumber: { type: 'string', maxLength: 100 },
            warrantyExpiry: { type: 'string', format: 'date-time' },
            customFields: { type: 'object', additionalProperties: true },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: { id: { type: 'string' }, assetNumber: { type: 'string' } },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Category/location not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'create'),
    },
    async (request, reply) => {
      const body = createBodySchema.parse(request.body)
      const repo = makeAssetRepo(request)
      const ctx = buildCmdCtx(request)
      const handler = new CreateAssetHandler(request.db, request.server.prisma, repo)

      const cmd = {
        name: body.name,
        categoryId: body.categoryId,
        criticality: body.criticality,
        installDate: body.installDate,
        ...(body.description !== undefined && { description: body.description }),
        ...(body.locationId !== undefined && { locationId: body.locationId }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
        ...(body.manufacturer !== undefined && { manufacturer: body.manufacturer }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.serialNumber !== undefined && { serialNumber: body.serialNumber }),
        ...(body.warrantyExpiry !== undefined && { warrantyExpiry: body.warrantyExpiry }),
        ...(body.customFields !== undefined && {
          customFields: body.customFields as Record<string, unknown>,
        }),
      }
      const assetId = await handler.handle(cmd, ctx)

      // Fetch the generated asset number for the response
      const created = await request.db.asset.findFirst({
        where: { id: assetId },
        select: { assetNumber: true },
      })

      // Sync to Meilisearch (non-blocking, non-fatal)
      void syncToSearch(request, assetId).catch(() => undefined)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(201).send({ id: assetId, assetNumber: created?.assetNumber ?? '' })
    },
  )

  // ── PATCH /:id ─────────────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Update mutable asset fields. assetNumber and tenantId are immutable.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            manufacturer: { type: 'string' },
            model: { type: 'string' },
            serialNumber: { type: 'string' },
            warrantyExpiry: { type: 'string', nullable: true },
            customFields: { type: 'object', additionalProperties: true },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'update'),
    },
    async (request, reply) => {
      const body = updateBodySchema.parse(request.body)
      const repo = makeAssetRepo(request)
      const ctx = buildCmdCtx(request)
      const handler = new UpdateAssetHandler(request.db, request.server.prisma, repo)

      const cmd = {
        assetId: request.params.id,
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.manufacturer !== undefined && { manufacturer: body.manufacturer }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.serialNumber !== undefined && { serialNumber: body.serialNumber }),
        ...(body.warrantyExpiry !== undefined && { warrantyExpiry: body.warrantyExpiry ?? null }),
        ...(body.customFields !== undefined && {
          customFields: body.customFields as Record<string, unknown>,
        }),
      }
      await handler.handle(cmd, ctx)

      // Re-index in Meilisearch (non-blocking)
      void syncToSearch(request, request.params.id).catch(() => undefined)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )

  // ── DELETE /:id ────────────────────────────────────────────────────────────
  // Soft-delete via decommission. ADMIN only.
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Soft-delete (decommission) an asset. Blocked when open work orders exist.',
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
          422: { description: 'Business rule error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'delete'),
    },
    async (request, reply) => {
      const body = (request.body as Record<string, unknown> | null) ?? {}
      const reason = String((body.reason as string | undefined) ?? '').trim()

      if (!reason) {
        throw new DomainException('reason is required', 'VALIDATION_ERROR', 400)
      }

      // Soft-delete via Prisma directly (the decommission command is for domain-level;
      // for API-initiated deletes we guard on open WOs and set deletedAt)
      const openCount = await request.db.workOrder.count({
        where: {
          assetId: request.params.id,
          deletedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      })
      if (openCount > 0) {
        throw new DomainException(
          `Cannot delete asset — ${openCount} open work order(s) exist`,
          'ASSET_HAS_OPEN_WO',
          409,
        )
      }

      await request.db.asset.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      })

      // Remove from Meilisearch
      const sync = new AssetSearchSyncService(request.server.search)
      void sync.deleteDocument(request.params.id, request.user.tid).catch(() => undefined)

      await invalidateAssetTreeCache(request.server.redis, request.user.tid)
      return reply.status(204).send()
    },
  )
}

export default crudRoutes
