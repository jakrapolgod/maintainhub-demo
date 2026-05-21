/**
 * Typed API client for asset endpoints.
 * DTO types are self-contained — do not import from apps/api.
 */
import { apiFetch } from '@/lib/api'

// ── Enums ─────────────────────────────────────────────────────────────────────

export type AssetStatus = 'OPERATIONAL' | 'STANDBY' | 'UNDER_MAINTENANCE' | 'DECOMMISSIONED'
export type Criticality = 'A' | 'B' | 'C' | 'D'
export type AttentionReason = 'OVERDUE_PM' | 'WARRANTY_EXPIRING' | 'HIGH_MTTR' | 'OPEN_EMERGENCY_WO'

// ── Sub-shapes ─────────────────────────────────────────────────────────────────

export interface AssetCategory {
  id: string
  code: string
  name: string
}

export interface LocationStub {
  id: string
  code: string
  name: string
}

export interface AssetStub {
  id: string
  assetNumber: string
  name: string
  status: AssetStatus
  criticality: Criticality
}

export interface AssetCard extends AssetStub {
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

export interface AssetDocument {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  storageKey: string
  signedUrl: string
  uploadedAt: string
  uploadedById?: string
  uploadedByName?: string
}

export interface PMScheduleStub {
  id: string
  title: string
  triggerType: string
  nextDue: string | null
  isActive: boolean
}

export interface WOSummary {
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

export interface AssetMetricsSummary {
  mtbfHours: number
  mtbfDays: number
  mttrHours: number
  mttrDays: number
  availability: number
  failureCount: number
  openWorkOrders: number
  totalLaborCost: number
  totalPartsCost: number
  totalLifetimeCost: number
}

export interface AssetDetail extends AssetCard {
  description: string | null
  customFields: Record<string, unknown>
  children: AssetStub[]
  recentWorkOrders: WOSummary[]
  pmSchedules: PMScheduleStub[]
  activePMCount: number
  nextPMDue: string | null
  documents: AssetDocument[]
  metrics: AssetMetricsSummary
}

// ── Tree types ─────────────────────────────────────────────────────────────────

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
  tree: AssetTreeNode[]
  flat: AssetFlatNode[]
  totalCount: number
}

// ── Metrics ────────────────────────────────────────────────────────────────────

export interface MonthlyMttrPoint {
  month: string
  mttrHours: number
  repairCount: number
}

export interface AssetMetricsDetail {
  assetId: string
  assetNumber: string
  name: string
  mtbfHours: number
  mtbfDays: number
  mttrHours: number
  mttrDays: number
  availability: number
  failureCount: number
  mttrTrend: MonthlyMttrPoint[]
  totalLaborCost: number
  totalPartsCost: number
  totalLifetimeCost: number
  periodStart: string
  periodEnd: string
}

// ── Search ─────────────────────────────────────────────────────────────────────

export interface AssetSearchHit extends AssetCard {
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

// ── Attention ──────────────────────────────────────────────────────────────────

export interface AssetAttentionItem {
  asset: AssetCard
  reasons: AttentionReason[]
  dueDate: string | null
  mttrHours: number | null
}

// ── Filters ────────────────────────────────────────────────────────────────────

export interface ListAssetsFilters {
  search?: string
  status?: string[]
  criticality?: string[]
  categoryId?: string
  locationId?: string
  parentId?: string
  hasOpenWOs?: boolean
  page?: number
  limit?: number
}

export interface AssetListResult {
  items: AssetCard[]
  total: number
}

// ── Payloads ───────────────────────────────────────────────────────────────────

export interface CreateAssetPayload {
  name: string
  categoryId: string
  criticality: Criticality
  installDate: string
  description?: string
  locationId?: string
  parentId?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  warrantyExpiry?: string
  customFields?: Record<string, unknown>
}

export interface UpdateAssetPayload {
  name?: string
  description?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  warrantyExpiry?: string | null
  customFields?: Record<string, unknown>
}

export interface ChangeStatusPayload {
  newStatus: 'OPERATIONAL' | 'STANDBY' | 'UNDER_MAINTENANCE'
  reason?: string
  linkedWorkOrder?: {
    title: string
    type?: string
    priority?: string
    description?: string
  }
}

export interface TransferAssetPayload {
  newLocationId: string
  newParentId?: string | null
}

// ── API functions ─────────────────────────────────────────────────────────────

export function listAssets(filters: ListAssetsFilters = {}): Promise<AssetListResult> {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.categoryId) params.set('categoryId', filters.categoryId)
  if (filters.locationId) params.set('locationId', filters.locationId)
  if (filters.parentId) params.set('parentId', filters.parentId)
  if (filters.hasOpenWOs !== undefined) params.set('hasOpenWOs', String(filters.hasOpenWOs))
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  filters.status?.forEach((s) => params.append('status', s))
  filters.criticality?.forEach((c) => params.append('criticality', c))
  const qs = params.toString()
  return apiFetch<AssetListResult>(`/assets${qs ? `?${qs}` : ''}`)
}

export function getAsset(id: string): Promise<AssetDetail> {
  return apiFetch<AssetDetail>(`/assets/${id}`)
}

export function getAssetTree(rootAssetId?: string, includeStats = true): Promise<AssetTreeResult> {
  const params = new URLSearchParams()
  if (rootAssetId) params.set('rootAssetId', rootAssetId)
  params.set('includeStats', String(includeStats))
  return apiFetch<AssetTreeResult>(`/assets/tree?${params.toString()}`)
}

export function searchAssets(
  q: string,
  filters?: { filter?: string; limit?: number; offset?: number },
): Promise<SearchAssetsResult> {
  const params = new URLSearchParams({ q })
  if (filters?.filter) params.set('filter', filters.filter)
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.offset) params.set('offset', String(filters.offset))
  return apiFetch<SearchAssetsResult>(`/assets/search?${params.toString()}`)
}

export function getAssetsAttention(): Promise<{ items: AssetAttentionItem[]; totalCount: number }> {
  return apiFetch('/assets/attention')
}

export function createAsset(
  payload: CreateAssetPayload,
): Promise<{ id: string; assetNumber: string }> {
  return apiFetch('/assets', 'POST', payload)
}

export function updateAsset(id: string, payload: UpdateAssetPayload): Promise<void> {
  return apiFetch(`/assets/${id}`, 'PATCH', payload)
}

export function changeAssetStatus(id: string, payload: ChangeStatusPayload): Promise<void> {
  return apiFetch(`/assets/${id}/status`, 'POST', payload)
}

export function decommissionAsset(
  id: string,
  payload: { reason: string; authorizedBy?: string },
): Promise<void> {
  return apiFetch(`/assets/${id}/decommission`, 'POST', payload)
}

export function transferAsset(id: string, payload: TransferAssetPayload): Promise<void> {
  return apiFetch(`/assets/${id}/transfer`, 'POST', payload)
}

export function deleteAsset(id: string, reason: string): Promise<void> {
  return apiFetch(`/assets/${id}`, 'DELETE', { reason })
}

export function getAssetMetrics(id: string): Promise<AssetMetricsDetail> {
  return apiFetch<AssetMetricsDetail>(`/assets/${id}/metrics`)
}

export function listAssetWorkOrders(
  id: string,
  filters?: { status?: string[]; type?: string[]; page?: number; limit?: number },
): Promise<{
  data: WOSummary[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}> {
  const params = new URLSearchParams()
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))
  filters?.status?.forEach((s) => params.append('status', s))
  filters?.type?.forEach((t) => params.append('type', t))
  const qs = params.toString()
  return apiFetch(`/assets/${id}/work-orders${qs ? `?${qs}` : ''}`)
}

export function listAssetPMSchedules(id: string): Promise<PMScheduleStub[]> {
  return apiFetch(`/assets/${id}/pm-schedules`)
}

export function listAssetDocuments(id: string): Promise<AssetDocument[]> {
  return apiFetch(`/assets/${id}/documents`)
}

export function deleteAssetDocument(assetId: string, docId: string): Promise<void> {
  return apiFetch(`/assets/${assetId}/documents/${docId}`, 'DELETE')
}

export function uploadAssetDocument(assetId: string, file: File): Promise<AssetDocument> {
  const form = new FormData()
  form.append('file', file)
  // Use raw fetch for multipart (apiFetch sends JSON)
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('mh_access_token') : null
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
  return fetch(`${BASE}/assets/${assetId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  }).then(async (res) => {
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string }
      throw new Error(err.message ?? 'Upload failed')
    }
    return res.json() as Promise<AssetDocument>
  })
}

export function getAssetQRCode(id: string): string {
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
  return `${BASE}/assets/${id}/qr`
}

export function getAssetLabelUrl(id: string): string {
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
  return `${BASE}/assets/${id}/label`
}

export function listCategories(): Promise<AssetCategory[]> {
  return apiFetch('/assets/categories')
}

export function listLocations(): Promise<LocationStub[]> {
  return apiFetch('/locations')
}
