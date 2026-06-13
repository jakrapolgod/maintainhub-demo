/**
 * Typed API client for analytics endpoints.
 *
 * Backs the /analytics page:
 *   GET /work-orders/metrics/reliability — per-asset MTBF/MTTR/availability
 *   GET /work-orders/metrics/costs       — cost mix + monthly cost by category
 *   GET /pm-schedules/compliance         — PM compliance (planned vs actual)
 *
 * DTO types mirror the server response shapes (see
 * apps/api/src/application/work-orders/queries/query.types.ts and
 * apps/api/src/application/pm-schedules/queries/query.types.ts).
 */
import { apiFetch } from '@/lib/api'

// ── Shared helpers ────────────────────────────────────────────────────────────

export interface DateRangeFilters {
  /** ISO 8601 range start. Default: 12 months before dateTo. */
  dateFrom?: string
  /** ISO 8601 range end. Default: now. */
  dateTo?: string
}

function rangeQuery(filters: DateRangeFilters): string {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// ── Asset reliability ─────────────────────────────────────────────────────────

export interface AssetReliabilityRow {
  assetId: string
  assetNumber: string
  assetName: string
  mtbfHours: number | null
  mttrHours: number | null
  availabilityPct: number
  failureCount: number
  openWorkOrders: number
  trend: 'up' | 'down' | 'flat'
}

export interface MonthlySeriesPoint {
  /** YYYY-MM */
  month: string
  values: Record<string, number | null>
}

export interface VolumeByTypePoint {
  month: string
  CORRECTIVE: number
  PREVENTIVE: number
  INSPECTION: number
  EMERGENCY: number
}

export interface AssetReliabilityResult {
  from: string
  to: string
  assets: AssetReliabilityRow[]
  mtbfSeries: MonthlySeriesPoint[]
  mttrSeries: MonthlySeriesPoint[]
  volumeByType: VolumeByTypePoint[]
}

export function getAssetReliability(
  filters: DateRangeFilters = {},
): Promise<AssetReliabilityResult> {
  return apiFetch<AssetReliabilityResult>(`/work-orders/metrics/reliability${rangeQuery(filters)}`)
}

// ── Cost breakdown ────────────────────────────────────────────────────────────

export interface CostMix {
  labor: number
  parts: number
  contractor: number
}

export interface MonthlyCostByCategory {
  month: string
  categories: Record<string, number>
}

export interface CostBreakdownResult {
  from: string
  to: string
  costMix: CostMix
  monthlyByCategory: MonthlyCostByCategory[]
  totalCost: number
}

export function getCostBreakdown(filters: DateRangeFilters = {}): Promise<CostBreakdownResult> {
  return apiFetch<CostBreakdownResult>(`/work-orders/metrics/costs${rangeQuery(filters)}`)
}

// ── PM compliance ─────────────────────────────────────────────────────────────

export interface PMComplianceResult {
  overallCompliancePct: number
  periodStart: string
  periodEnd: string
  totalSchedules: number
  /** Schedules with compliancePct = 100. */
  fullyCompliant: number
}

export function getPMCompliance(): Promise<PMComplianceResult> {
  return apiFetch<PMComplianceResult>('/pm-schedules/compliance')
}
