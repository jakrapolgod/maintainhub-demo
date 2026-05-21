/**
 * Shared types for all asset command handlers.
 *
 * Re-exports `CommandContext` and `writeAuditLog` from the work-order layer so
 * the asset layer shares the same execution-context shape without duplication.
 */
import { randomUUID } from 'node:crypto'

export type { CommandContext } from '../../work-orders/commands/command.types.js'
export { writeAuditLog } from '../../work-orders/commands/command.types.js'

// ── ID generation ─────────────────────────────────────────────────────────────

/**
 * Generate a CUID-compatible asset ID from a UUID v4.
 *
 * Strategy: strip hyphens, take 24 chars, force the first char to be a
 * lowercase letter so it passes the CUID regex (`^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$`).
 */
export function generateAssetId(): string {
  return randomUUID()
    .replace(/-/g, '')
    .slice(0, 24)
    .replace(/^[^a-z]/, 'c')
}
