/**
 * Shared types for all asset query handlers.
 *
 * ## Design philosophy
 * Query handlers are pure read projections — no aggregate loading, no domain
 * objects.  Prisma rows project directly to plain DTOs for maximum performance.
 * All monetary values are plain `number` (not Decimal), all dates are ISO-8601
 * strings so results serialise trivially to JSON.
 */

// ── Re-export QueryContext from the work-order layer (shared shape) ───────────
export type { QueryContext } from '../../work-orders/queries/query.types.js'

// ── Shared sub-shapes ─────────────────────────────────────────────────────────

export interface AssetStub {
  id: string
  assetNumber: string
  name: string
  status: string
  criticality: string
}

export interface AssetCardDto extends AssetStub {
  categoryId: string
  categoryName: string
  locationId: string | null
  locationName: string | null
  parentId: string | null
  parentName: string | null
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  installDate: string | null
  warrantyExpiry: string | null
  isWarrantyActive: boolean
  openWOCount: number
  createdAt: string
  updatedAt: string
}

// ── GetAsset ──────────────────────────────────────────────────────────────────

export interface WorkOrderSummaryDto {
  id: string
  woNumber: string
  title: string
  type: string
  status: string
  priority: string
  startedAt: string | null
  completedAt: string | null
  totalCost: number | null
}

export interface PMScheduleSummaryDto {
  id: string
  title: string
  triggerType: string
  nextDue: string | null
  isActive: boolean
}

export interface AssetDocumentDto {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  storageKey: string
  signedUrl: string
  uploadedAt: string
}

export interface AssetMetricsSummary {
  mtbfHours: number
  mtbfDays: number
  mttrHours: number
  mttrDays: number
  availability: number // percentage 0-100
  failureCount: number
  openWorkOrders: number
  totalLaborCost: number
  totalPartsCost: number
  totalLifetimeCost: number
}

export interface AssetDetail extends AssetCardDto {
  description: string | null
  customFields: Record<string, unknown>
  children: AssetStub[]
  recentWorkOrders: WorkOrderSummaryDto[]
  pmSchedules: PMScheduleSummaryDto[]
  activePMCount: number
  nextPMDue: string | null
  documents: AssetDocumentDto[]
  metrics: AssetMetricsSummary
}

// ── GetAssetTree ──────────────────────────────────────────────────────────────

export interface AssetTreeNode extends AssetStub {
  locationId: string | null
  locationName: string | null
  openWOCount: number
  lastMaintenanceDate: string | null
  children: AssetTreeNode[]
}

export interface AssetFlatNode extends AssetStub {
  locationId: string | null
  locationName: string | null
  parentId: string | null
  depth: number
  openWOCount: number
  lastMaintenanceDate: string | null
}

export interface AssetTreeResult {
  /** Hierarchical (nested) view — use when rendering a tree component. */
  tree: AssetTreeNode[]
  /** Flat list with depth indicators — use when rendering a table/grid. */
  flat: AssetFlatNode[]
  totalCount: number
}

// ── GetAssetMetrics ───────────────────────────────────────────────────────────

export interface MonthlyMttrPoint {
  /** YYYY-MM */
  month: string
  mttrHours: number
  repairCount: number
}

export interface AssetMetricsDetail {
  assetId: string
  assetNumber: string
  name: string
  /** Based on last 12 months of CORRECTIVE WOs. */
  mtbfHours: number
  mtbfDays: number
  mttrHours: number
  mttrDays: number
  /** MTBF / (MTBF + MTTR) × 100 */
  availability: number
  failureCount: number
  /** Monthly MTTR trend — 12 data points, oldest first. */
  mttrTrend: MonthlyMttrPoint[]
  totalLaborCost: number
  totalPartsCost: number
  totalLifetimeCost: number
  /** Snapshot of the last 12 months' completed WOs used for the calculations. */
  periodStart: string
  periodEnd: string
}

// ── SearchAssets ──────────────────────────────────────────────────────────────

export interface AssetSearchHit extends AssetCardDto {
  /** Meilisearch-highlighted snippets — field → highlighted HTML string (undefined when field not matched). */
  highlights: {
    assetNumber: string | undefined
    name: string | undefined
    serialNumber: string | undefined
    manufacturer: string | undefined
    model: string | undefined
  }
}

export interface SearchAssetsResult {
  hits: AssetSearchHit[]
  estimatedTotal: number
  processingTimeMs: number
  query: string
}

// ── GetAssetsByLocation ───────────────────────────────────────────────────────

export interface AssetsByLocationGroup {
  locationId: string
  locationCode: string
  locationName: string
  parentLocationId: string | null
  assets: AssetCardDto[]
  openWOCount: number
}

export interface AssetsByLocationResult {
  groups: AssetsByLocationGroup[]
  ungrouped: AssetCardDto[] // assets with no location
  totalAssets: number
}

// ── GetAssetsNeedingAttention ─────────────────────────────────────────────────

export type AttentionReason = 'OVERDUE_PM' | 'WARRANTY_EXPIRING' | 'HIGH_MTTR' | 'OPEN_EMERGENCY_WO'

export interface AssetAttentionItem {
  asset: AssetCardDto
  reasons: AttentionReason[]
  /** ISO date for the overdue PM's nextDue or warranty expiry. */
  dueDate: string | null
  /** MTTR hours when reason includes HIGH_MTTR. */
  mttrHours: number | null
}

export interface AssetsNeedingAttentionResult {
  items: AssetAttentionItem[]
  totalCount: number
}
