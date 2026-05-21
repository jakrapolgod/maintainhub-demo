/**
 * Shared helpers for PM-schedule route handlers.
 */
import type { FastifyRequest, FastifySchema } from 'fastify'
import { PrismaPMScheduleRepository } from '../../../infrastructure/pm-schedules/index.js'
import type { CommandContext } from '../../../application/pm-schedules/commands/index.js'
import type { QueryContext }   from '../../../application/pm-schedules/queries/index.js'

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

export function buildQryCtx(request: FastifyRequest): QueryContext {
  return {
    executingUserId: request.user.sub,
    tenantId:        request.user.tid,
    userRole:        request.user.role,
  }
}

export function makePMRepo(request: FastifyRequest): PrismaPMScheduleRepository {
  return new PrismaPMScheduleRepository(request.server.prisma)
}

// ── OpenAPI type extension ────────────────────────────────────────────────────

export type OASSchema = FastifySchema & {
  description?: string
  tags?:        string[]
  security?:    unknown[]
}

// ── Reusable JSON Schema fragments ────────────────────────────────────────────

export const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'PM schedule CUID' } },
} as const

export const errorBody = {
  type: 'object',
  properties: {
    code:      { type: 'string' },
    message:   { type: 'string' },
    requestId: { type: 'string' },
  },
} as const
