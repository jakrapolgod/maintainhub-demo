/**
 * Typed API client for work-order endpoints.
 *
 * All functions use the shared `apiFetch` helper from `@/lib/api`, which
 * injects the Bearer token, normalises errors into `ApiError`, and handles
 * 204 No-Content responses.
 *
 * ## Type philosophy
 * DTO types mirror the server response shapes; they are intentionally
 * self-contained so the web package does not import from `apps/api`.
 * When the API schema changes, update these types to match.
 */
import { apiFetch } from '@/lib/api'

// ── Shared enums ──────────────────────────────────────────────────────────────

export type WOStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type WOType = 'CORRECTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY'
export type WOPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

// ── Sub-shapes ────────────────────────────────────────────────────────────────

export interface UserStub {
  id: string
  name: string
  avatarUrl: string | null
}

export interface LaborEntry {
  id: string
  technicianId: string
  technicianName: string
  date: string
  hours: number
  ratePerHour: number
  totalCost: number
  description: string | null
}

export interface PartUsage {
  id: string
  partId: string
  partNumber: string
  partName: string
  quantity: number
  unitCost: number
  totalCost: number
  usedAt: string
}

export interface Attachment {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  storageKey: string
  thumbnailKey: string | null
  uploadedById: string
  uploadedByName: string
  uploadedAt: string
  downloadUrl: string
}

export interface Comment {
  id: string
  body: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: string
  action: string
  userId: string | null
  userName: string | null
  before: unknown
  after: unknown
  ipAddress: string | null
  createdAt: string
}

// ── Main DTOs ─────────────────────────────────────────────────────────────────

export interface WorkOrderSummary {
  id: string
  woNumber: string
  title: string
  type: WOType
  priority: WOPriority
  status: WOStatus
  assetId: string
  assetName: string
  assigneeIds: string[]
  assignees: UserStub[]
  dueDate: string | null
  slaDeadline: string | null
  completedAt: string | null
  totalLaborCost: number | null
  totalPartsCost: number | null
  createdAt: string
  updatedAt: string
}

export interface WorkOrderDetail extends WorkOrderSummary {
  description: string | null
  parentId: string | null
  assetLocation: string | null
  failureCodeId: string | null
  failureCodeName: string | null
  resolution: string | null
  startedAt: string | null
  createdById: string
  createdByName: string
  laborEntries: LaborEntry[]
  partUsages: PartUsage[]
  attachments: Attachment[]
  comments: Comment[]
  auditTrail: AuditEntry[]
}

export interface WorkOrderListResult {
  items: WorkOrderSummary[]
  total: number
  nextCursor: string | null
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface ListWorkOrdersFilters {
  status?: WOStatus[]
  priority?: WOPriority[]
  type?: WOType[]
  assetId?: string
  assigneeId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  sortBy?: 'createdAt' | 'priority' | 'dueDate' | 'woNumber'
  sortDir?: 'asc' | 'desc'
  page?: number
  limit?: number
  cursor?: string
}

export interface CreateWorkOrderPayload {
  title: string
  type: WOType
  priority: WOPriority
  assetId: string
  description?: string
  assigneeIds?: string[]
  dueDate?: string
  parentWorkOrderId?: string
}

export interface UpdateWorkOrderPayload {
  title?: string
  description?: string
  priority?: WOPriority
  dueDate?: string
  assigneeIds?: string[]
}

export interface AddLaborPayload {
  date: string // YYYY-MM-DD
  hours: number
  rate: number
  description?: string
}

export interface UsePartPayload {
  partId: string
  quantity: number
  unitCost?: number
}

// ── Response types ────────────────────────────────────────────────────────────

export interface CreatedWorkOrder {
  id: string
  woNumber: string
}

export interface CreatedLaborEntry {
  id: string
}

export interface CreatedPartUsage {
  id: string
}

export interface UploadedAttachment {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  storageKey: string
  downloadUrl: string
  uploadedAt: string
}

export interface WorkOrderDraft {
  title: string
  description: string
  type: WOType
  priority: WOPriority
  suggestedAssignees: string[] | undefined
  estimatedHours: number | undefined
  originalMessage: string
  assetId: string | undefined
}

// ── Metrics / calendar types ──────────────────────────────────────────────────

export interface WorkOrderMetrics {
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  overdueCount: number
  avgCompletionHours: number | null
  mttr: number | null
  totalCost: number
  trend: Array<{
    period: string
    status: string
    count: number
  }>
}

export interface CalendarWorkOrder {
  id: string
  woNumber: string
  title: string
  type: WOType
  priority: WOPriority
  status: WOStatus
  assetId: string
  assetName: string
}

export interface PMDueEntry {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
}

export interface WorkOrderCalendar {
  from: string
  to: string
  days: Array<{
    date: string
    workOrders: CalendarWorkOrder[]
    pmDue: PMDueEntry[]
  }>
}

// ── Query-string serialisation ────────────────────────────────────────────────

/**
 * Converts a filters object to a URLSearchParams string.
 * Arrays are serialised as repeated keys: `status=OPEN&status=IN_PROGRESS`.
 */
function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, String(v))
    } else {
      qs.set(key, String(value))
    }
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// ── API functions ─────────────────────────────────────────────────────────────

const BASE = '/work-orders'

/**
 * Fetch a paginated, filterable list of work orders.
 */
export function listWorkOrders(filters: ListWorkOrdersFilters = {}): Promise<WorkOrderListResult> {
  return apiFetch<WorkOrderListResult>(
    `${BASE}${toQueryString(filters as Record<string, unknown>)}`,
  )
}

/**
 * Fetch full detail for a single work order (with labor, parts, attachments,
 * comments, and the last 50 audit trail entries).
 */
export function getWorkOrder(id: string): Promise<WorkOrderDetail> {
  return apiFetch<WorkOrderDetail>(`${BASE}/${id}`)
}

/**
 * Create a new work order.  Returns the generated ID and WO number.
 */
export function createWorkOrder(data: CreateWorkOrderPayload): Promise<CreatedWorkOrder> {
  return apiFetch<CreatedWorkOrder>(BASE, 'POST', data)
}

/**
 * Partially update a work order's scalar fields.
 * TECHNICIAN callers may only update `description`.
 */
export function updateWorkOrder(id: string, data: UpdateWorkOrderPayload): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, 'PATCH', data)
}

/**
 * Soft-delete (cancel) a work order.  COMPLETED WOs cannot be cancelled.
 */
export function deleteWorkOrder(id: string, reason = 'Cancelled via web'): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, 'DELETE', { reason })
}

/**
 * Assign one or more technicians to a work order.
 */
export function assignWorkOrder(
  id: string,
  technicianIds: string[],
): Promise<{ assigned: number }> {
  return apiFetch<{ assigned: number }>(`${BASE}/${id}/assign`, 'POST', { technicianIds })
}

/**
 * Transition a work order from OPEN to IN_PROGRESS.
 */
export function startWorkOrder(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/start`, 'POST')
}

/**
 * Mark an IN_PROGRESS work order as COMPLETED.
 */
export function completeWorkOrder(
  id: string,
  resolution: string,
  failureCodeId?: string,
): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/complete`, 'POST', {
    resolution,
    ...(failureCodeId !== undefined && { failureCodeId }),
  })
}

/**
 * Put a work order on hold.
 */
export function holdWorkOrder(id: string, reason: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/hold`, 'POST', { reason })
}

/**
 * Cancel a work order via the action endpoint (POST, not DELETE).
 */
export function cancelWorkOrder(id: string, reason: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/cancel`, 'POST', { reason })
}

/**
 * Record hours worked on a work order.
 */
export function addLabor(id: string, entry: AddLaborPayload): Promise<CreatedLaborEntry> {
  return apiFetch<CreatedLaborEntry>(`${BASE}/${id}/labor`, 'POST', entry)
}

/**
 * List all labor entries for a work order.
 */
export function listLabor(id: string): Promise<LaborEntry[]> {
  return apiFetch<LaborEntry[]>(`${BASE}/${id}/labor`)
}

/**
 * Record spare-part consumption on a work order.
 */
export function usePart(id: string, usage: UsePartPayload): Promise<CreatedPartUsage> {
  return apiFetch<CreatedPartUsage>(`${BASE}/${id}/parts`, 'POST', usage)
}

/**
 * List all part usages for a work order.
 */
export function listParts(id: string): Promise<PartUsage[]> {
  return apiFetch<PartUsage[]>(`${BASE}/${id}/parts`)
}

/**
 * Post a comment on a work order.
 * Optionally supply `mentions` (user IDs) or embed @userId markers in content.
 */
export function addComment(
  id: string,
  content: string,
  mentions?: string[],
): Promise<Pick<Comment, 'id' | 'body' | 'authorId' | 'createdAt'>> {
  return apiFetch(`${BASE}/${id}/comments`, 'POST', {
    content,
    ...(mentions !== undefined && { mentions }),
  })
}

/**
 * List all comments for a work order.
 */
export function listComments(id: string): Promise<Comment[]> {
  return apiFetch<Comment[]>(`${BASE}/${id}/comments`)
}

/**
 * Upload a file attachment to a work order.
 * Uses a raw FormData POST — bypasses `apiFetch` JSON serialisation.
 */
export async function uploadAttachment(id: string, file: File): Promise<UploadedAttachment> {
  const { API_BASE, tokenStore } = await import('@/lib/api')
  const form = new FormData()
  form.append('file', file)

  const headers: HeadersInit = {}
  const token = tokenStore.get()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${BASE}/${id}/attachments`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    const { ApiError } = await import('@/lib/api')
    let payload: { code?: string; message?: string } = {}
    try {
      payload = (await res.json()) as typeof payload
    } catch {
      /* ignore */
    }
    throw new ApiError(
      payload.code ?? 'UPLOAD_FAILED',
      payload.message ?? `Upload failed with status ${res.status}`,
      res.status,
    )
  }
  return res.json() as Promise<UploadedAttachment>
}

/**
 * List attachments for a work order (includes fresh presigned download URLs).
 */
export function listAttachments(id: string): Promise<Attachment[]> {
  return apiFetch<Attachment[]>(`${BASE}/${id}/attachments`)
}

/**
 * Generate an AI work-order draft from a natural-language message.
 * Returns a draft that must be confirmed by the user before saving.
 */
export function draftFromNL(message: string, assetId?: string): Promise<WorkOrderDraft> {
  return apiFetch<WorkOrderDraft>(`${BASE}/ai/draft`, 'POST', {
    message,
    ...(assetId !== undefined && { assetId }),
  })
}

// ── Analytics API ─────────────────────────────────────────────────────────────

export interface MetricsFilters {
  dateFrom?: string
  dateTo?: string
  groupBy?: 'day' | 'week' | 'month'
}

/**
 * Fetch aggregated work-order KPIs for the dashboard.
 * Results are cached server-side for 5 minutes.
 */
export function getWorkOrderMetrics(filters: MetricsFilters = {}): Promise<WorkOrderMetrics> {
  return apiFetch<WorkOrderMetrics>(
    `${BASE}/metrics${toQueryString(filters as Record<string, unknown>)}`,
  )
}

// ── Parts search (for PartUsageForm autocomplete) ─────────────────────────────

export interface PartSearchResult {
  id: string
  partNumber: string
  name: string
  description: string | null
  quantity: number
  reservedQty: number
  unitCost: number
  storeLocation: string | null
}

/**
 * Search parts by name or part number — used in PartUsageForm autocomplete.
 */
export function searchParts(
  search: string,
  limit = 20,
): Promise<{ items: PartSearchResult[]; total: number }> {
  return apiFetch<{ items: PartSearchResult[]; total: number }>(
    `/parts?search=${encodeURIComponent(search)}&limit=${limit}`,
  )
}

// ── Failure codes (for CompleteWorkOrderDialog) ────────────────────────────────

export interface FailureCodeResult {
  id: string
  code: string
  name: string
  category: string
  system: string | null
  notes: string | null
}

/**
 * List all failure codes, optionally filtered by category.
 * Results are grouped by category on the client for tree display.
 */
export function listFailureCodes(): Promise<FailureCodeResult[]> {
  return apiFetch<FailureCodeResult[]>('/failure-codes')
}

/**
 * Fetch WOs and PM due dates grouped by day for the given month.
 */
export function getWorkOrderCalendar(year: number, month: number): Promise<WorkOrderCalendar> {
  return apiFetch<WorkOrderCalendar>(`${BASE}/calendar?year=${year}&month=${month}`)
}
