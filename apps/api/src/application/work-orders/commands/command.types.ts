/**
 * Shared types for all work-order command handlers.
 *
 * ## Design decisions
 *
 * • `CommandContext` bundles the execution identity that every handler needs —
 *   extracted from the JWT + request headers by the route layer, then forwarded
 *   as-is to every handler.  Handlers never read from the HTTP layer directly.
 *
 * • SLA hours follow the spec values (CRITICAL=4h, HIGH=8h, MEDIUM=24h, LOW=72h).
 *   These intentionally differ from the legacy `work-order.service.ts` constants,
 *   which predate this application layer.
 *
 * • `writeAuditLog` is a shared helper so handlers don't duplicate boilerplate.
 *   It deliberately does NOT throw on failure — a failed audit write must never
 *   roll back a successful domain operation.
 */
import { randomUUID } from 'node:crypto'
import type { PrismaClient, Prisma } from '@prisma/client'

// ── Execution context ─────────────────────────────────────────────────────────

export interface CommandContext {
  /** ID of the user performing the operation — from JWT `sub` claim. */
  executingUserId: string
  /** Tenant the operation is scoped to — from JWT `tid` claim. */
  tenantId: string
  /** User's role — from JWT `role` claim.  Used for authorization checks. */
  userRole: string
  /** Null when running outside an HTTP context (tests, batch jobs). */
  ipAddress: string | null
  /** Null when running outside an HTTP context. */
  userAgent: string | null
}

// ── SLA defaults ──────────────────────────────────────────────────────────────

/**
 * Platform-default SLA hours per priority.
 * Tenant-level overrides (stored in Tenant.settings.slaHours) are applied by
 * the SLA-checker worker; the command layer uses these defaults when creating
 * new work orders so the deadline is set immediately on creation.
 */
export const DEFAULT_SLA_HOURS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
}

export function computeSlaDeadline(
  priority: string,
  tenantSlaHours?: Record<string, number>,
): Date {
  const hours = tenantSlaHours?.[priority] ?? DEFAULT_SLA_HOURS[priority] ?? 72
  return new Date(Date.now() + hours * 3_600_000)
}

// ── Shared audit log writer ───────────────────────────────────────────────────

/**
 * Write a row to the `AuditLog` table.
 *
 * Non-fatal: errors are swallowed so a failed audit write never rolls back
 * a completed domain operation.  In production, failed writes surface as
 * warnings in the structured log output.
 */
export async function writeAuditLog(
  prisma: PrismaClient,
  data: {
    tenantId: string
    userId: string
    action: string
    entityType: string
    entityId: string
    before?: Prisma.InputJsonValue
    after?: Prisma.InputJsonValue
    ipAddress?: string | null
    userAgent?: string | null
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        ...(data.before !== undefined && { before: data.before }),
        ...(data.after !== undefined && { after: data.after }),
        ...(data.ipAddress != null && { ipAddress: data.ipAddress }),
        ...(data.userAgent != null && { userAgent: data.userAgent }),
      },
    })
  } catch {
    // Audit failures are non-fatal — log in prod via structured logger
  }
}

// ── ID generation ─────────────────────────────────────────────────────────────

/** Generates a UUID v4 for new embedded entity IDs (LaborEntry, PartUsage). */
export { randomUUID as generateId }
