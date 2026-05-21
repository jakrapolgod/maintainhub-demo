/**
 * Shared types for all PM-schedule command handlers.
 *
 * Re-exports `CommandContext`, `writeAuditLog`, and the ID generator from the
 * work-order layer so the PM layer shares the same execution-context shape.
 */
import { randomUUID } from 'node:crypto'

export type { CommandContext } from '../../work-orders/commands/command.types.js'
export { writeAuditLog } from '../../work-orders/commands/command.types.js'

// ── ID generation (same strategy as AssetId / WorkOrderId) ───────────────────

export function generatePMId(): string {
  return randomUUID()
    .replace(/-/g, '')
    .slice(0, 24)
    .replace(/^[^a-z]/, 'c')
}
