import type { LaborCost } from './value-objects/labor-cost.js'
import type { Money } from './value-objects/money.js'

// ── Work Order Type ───────────────────────────────────────────────────────────

export type WOType = 'CORRECTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY'

// ── Embedded entities ─────────────────────────────────────────────────────────

/**
 * A single labour time entry recorded against a work order.
 * Wraps a `LaborCost` value object so all monetary invariants are preserved.
 */
export interface LaborEntry {
  readonly id: string
  readonly technicianId: string
  readonly date: Date
  readonly cost: LaborCost
  readonly description: string | undefined
}

/**
 * Record of a spare part consumed during work order execution.
 * `unitCost` is a snapshot of the part's price at the time of use —
 * insulated from future price changes on the master part record.
 */
export interface PartUsage {
  readonly id: string
  readonly partId: string
  readonly quantity: number
  readonly unitCost: Money
  readonly usedAt: Date
}

/**
 * Reference to a file stored in object storage (MinIO / S3).
 * The aggregate only holds the metadata; actual file retrieval uses
 * `storageKey` + the infrastructure's presigned-URL helper.
 */
export interface Attachment {
  readonly id: string
  readonly fileName: string
  readonly storageKey: string
  readonly mimeType: string
  /** File size in bytes. */
  readonly fileSize: number
  readonly uploadedById: string
  readonly uploadedAt: Date
}
