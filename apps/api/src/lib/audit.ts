import type { FastifyRequest } from 'fastify'

/**
 * Audit metadata extracted from an authenticated Fastify request.
 * Uses string | null (not undefined) so values can be passed directly to
 * Prisma nullable fields without hitting the exactOptionalPropertyTypes constraint.
 */
export interface AuditMeta {
  userId: string
  ipAddress: string | null
  userAgent: string | null
}

/** Build audit metadata from a Fastify request on a protected route. */
export function auditFrom(request: FastifyRequest): AuditMeta {
  const ua = request.headers['user-agent']
  return {
    userId: request.user.sub,
    ipAddress: request.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  }
}
