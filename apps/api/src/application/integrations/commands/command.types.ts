/**
 * Shared types for all integration command handlers.
 */
import { randomBytes } from 'node:crypto'

export type { CommandContext } from '../../work-orders/commands/command.types.js'
export { writeAuditLog } from '../../work-orders/commands/command.types.js'

// ── ID generation ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return randomBytes(12)
    .toString('hex')
    .replace(/^[^a-z]/, 'c')
}

/**
 * Generate a cryptographically random HMAC-SHA256 secret (40 bytes = 80 hex chars).
 * 40 bytes exceeds the SHA-256 block size (64 bytes) and provides 320 bits of entropy.
 */
export function generateWebhookSecret(): string {
  return randomBytes(40).toString('hex') // 80-char hex string
}
