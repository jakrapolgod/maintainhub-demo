/**
 * Failure code routes (ISO 14224 taxonomy).
 *
 * GET /failure-codes         — all codes, optionally grouped as a tree
 * GET /failure-codes/search  — full-text search by code, name, category, system
 *
 * Failure codes are global (cross-tenant) — no tenantId filter.
 * Auth: any authenticated user (read-only, no mutations from the API).
 */
import { z } from 'zod'
import type { FastifyPluginAsync, FastifySchema } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { DomainException } from '../../../errors/domain.exception.js'

type OASSchema = FastifySchema & { description?: string; tags?: string[]; security?: unknown[] }

// ── Zod schemas ───────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  category: z.string().optional(),
  system: z.string().optional(),
  /** When true, returns a nested tree; when false (default), returns a flat list. */
  tree: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ── DTO shapes ─────────────────────────────────────────────────────────────────

interface FailureCodeDto {
  id: string
  code: string
  name: string
  category: string
  system: string | null
  notes: string | null
}

interface FailureCodeTreeNode {
  category: string
  children: Array<{
    system: string
    codes: FailureCodeDto[]
  }>
}

// ── Error body ─────────────────────────────────────────────────────────────────

const errorBody = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const

// ── Plugin ────────────────────────────────────────────────────────────────────

const failureCodeRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ─────────────────────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: {
        description: [
          'List ISO 14224 failure codes. Optionally filter by category or system.',
          'Set tree=true to get a nested Category → System → Code hierarchy.',
        ].join(' '),
        tags: ['failure-codes'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category (case-insensitive partial match)',
            },
            system: { type: 'string', description: 'Filter by system' },
            tree: { type: 'string', enum: ['true', 'false'], default: 'false' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
              tree: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q = listQuerySchema.parse(request.query)
      const skip = (q.page - 1) * q.limit

      // Build where clause
      const where: Record<string, unknown> = {}
      if (q.category) where.category = { contains: q.category, mode: 'insensitive' }
      if (q.system) where.system = { contains: q.system, mode: 'insensitive' }

      const [rows, total] = await Promise.all([
        request.server.prisma.failureCode.findMany({
          where,
          orderBy: [{ category: 'asc' }, { system: 'asc' }, { code: 'asc' }],
          skip,
          take: q.limit,
        }),
        request.server.prisma.failureCode.count({ where }),
      ])

      const items: FailureCodeDto[] = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        system: r.system ?? null,
        notes: r.notes ?? null,
      }))

      if (!q.tree) {
        return reply.send({ items, total, tree: [] })
      }

      // Build nested tree: Category → System → Codes
      const categoryMap = new Map<string, Map<string, FailureCodeDto[]>>()
      for (const item of items) {
        const sysKey = item.system ?? 'General'
        if (!categoryMap.has(item.category)) {
          categoryMap.set(item.category, new Map())
        }
        const sysMap = categoryMap.get(item.category)!
        if (!sysMap.has(sysKey)) sysMap.set(sysKey, [])
        sysMap.get(sysKey)!.push(item)
      }

      const tree: FailureCodeTreeNode[] = [...categoryMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, sysMap]) => ({
          category,
          children: [...sysMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([system, codes]) => ({ system, codes })),
        }))

      return reply.send({ items, total, tree })
    },
  )

  // ── GET /search ───────────────────────────────────────────────────────────
  // Static path — registered BEFORE a potential /:id parameter route.
  fastify.get(
    '/search',
    {
      schema: {
        description: [
          'Search failure codes by code, name, category, system, or notes.',
          'Uses case-insensitive full-text search across all text fields.',
        ].join(' '),
        tags: ['failure-codes'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 200, description: 'Search query' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
              query: { type: 'string' },
            },
          },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const q = searchQuerySchema.parse(request.query)

      const where = {
        OR: [
          { code: { contains: q.q, mode: 'insensitive' as const } },
          { name: { contains: q.q, mode: 'insensitive' as const } },
          { category: { contains: q.q, mode: 'insensitive' as const } },
          { system: { contains: q.q, mode: 'insensitive' as const } },
          { notes: { contains: q.q, mode: 'insensitive' as const } },
        ],
      }

      const [rows, total] = await Promise.all([
        request.server.prisma.failureCode.findMany({
          where,
          orderBy: [{ category: 'asc' }, { code: 'asc' }],
          take: q.limit,
        }),
        request.server.prisma.failureCode.count({ where }),
      ])

      const items: FailureCodeDto[] = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        system: r.system ?? null,
        notes: r.notes ?? null,
      }))

      return reply.send({ items, total, query: q.q })
    },
  )

  // ── GET /:id ──────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Get a single failure code by ID.',
        tags: ['failure-codes'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('pm-schedule', 'read'),
    },
    async (request, reply) => {
      const row = await request.server.prisma.failureCode.findUnique({
        where: { id: request.params.id },
      })
      if (!row) {
        throw new DomainException('Failure code not found', 'FAILURE_CODE_NOT_FOUND', 404)
      }
      return reply.send({
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        system: row.system ?? null,
        notes: row.notes ?? null,
      })
    },
  )
}

export default failureCodeRoutes
