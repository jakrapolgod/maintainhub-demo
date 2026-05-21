/**
 * Shared helpers for asset route handlers.
 */
import type { FastifyRequest, FastifySchema } from 'fastify'
import { PrismaAssetRepository } from '../../../infrastructure/assets/index.js'
import type { CommandContext } from '../../../application/assets/commands/index.js'
import type { QueryContext } from '../../../application/assets/queries/index.js'

// ── Context builders ──────────────────────────────────────────────────────────

export function buildCmdCtx(request: FastifyRequest): CommandContext {
  const ua = request.headers['user-agent']
  return {
    executingUserId: request.user.sub,
    tenantId: request.user.tid,
    userRole: request.user.role,
    ipAddress: request.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  }
}

export function buildQryCtx(request: FastifyRequest): QueryContext {
  return {
    executingUserId: request.user.sub,
    tenantId: request.user.tid,
    userRole: request.user.role,
  }
}

export function makeAssetRepo(request: FastifyRequest): PrismaAssetRepository {
  return new PrismaAssetRepository(request.server.prisma, request.server.redis)
}

// ── OpenAPI type extension ─────────────────────────────────────────────────────

export type OASSchema = FastifySchema & {
  description?: string
  tags?: string[]
  security?: unknown[]
}

// ── Reusable JSON Schema fragments ────────────────────────────────────────────

export const assetIdParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Asset CUID' } },
} as const

export const errorBody = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const

// ── Redis cache helpers for asset tree ────────────────────────────────────────

const TREE_TTL = 60 // seconds

export function assetTreeCacheKey(tenantId: string, rootId?: string): string {
  return `asset:tree:${tenantId}:${rootId ?? 'root'}`
}

export function assetTreeCachePattern(tenantId: string): string {
  return `asset:tree:${tenantId}:*`
}

export async function invalidateAssetTreeCache(
  redis: { keys: (p: string) => Promise<string[]>; del: (...k: string[]) => Promise<number> },
  tenantId: string,
): Promise<void> {
  try {
    const keys = await redis.keys(assetTreeCachePattern(tenantId))
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    // Non-fatal
  }
}

export async function treeGet<T>(
  redis: { get: (k: string) => Promise<string | null> },
  key: string,
): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function treeSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redis: { set: (...args: any[]) => Promise<unknown> },
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', TREE_TTL)
  } catch {
    // Non-fatal
  }
}
