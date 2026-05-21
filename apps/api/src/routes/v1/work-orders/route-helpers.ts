/**
 * Shared helpers for work-order route handlers.
 *
 * Centralised here so actions, labor, parts, comments, and attachments
 * all build context objects with identical field extraction.
 */
import type { FastifyRequest, FastifySchema } from 'fastify'
import { PrismaWorkOrderRepository } from '../../../infrastructure/work-orders/index.js'
import type { CommandContext } from '../../../application/work-orders/commands/index.js'

// ── Context builders ──────────────────────────────────────────────────────────

export function buildCmdCtx(request: FastifyRequest): CommandContext {
  const ua = request.headers['user-agent']
  return {
    executingUserId: request.user.sub,
    tenantId:        request.user.tid,
    userRole:        request.user.role,
    ipAddress:       request.ip ?? null,
    userAgent:       typeof ua === 'string' ? ua : null,
  }
}

/** Construct a repository scoped to the underlying (global) Prisma client + Redis. */
export function makeWoRepo(request: FastifyRequest): PrismaWorkOrderRepository {
  return new PrismaWorkOrderRepository(request.server.prisma, request.server.redis)
}

// ── OpenAPI type extension ────────────────────────────────────────────────────

/**
 * Extends `FastifySchema` with common OpenAPI fields that require a Swagger
 * plugin to be officially typed but are read by downstream tools.
 */
export type OASSchema = FastifySchema & {
  description?: string
  tags?:        string[]
  security?:    unknown[]
}

// ── Reusable JSON Schema fragments ────────────────────────────────────────────

export const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Work order CUID' } },
} as const

export const errorBody = {
  type: 'object',
  properties: {
    code:      { type: 'string' },
    message:   { type: 'string' },
    requestId: { type: 'string' },
  },
} as const
