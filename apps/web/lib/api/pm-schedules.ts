/**
 * Typed API client for PM-schedule endpoints.
 * DTO types are self-contained — do not import from apps/api.
 */
import { apiFetch } from '@/lib/api'

// ── Enums ─────────────────────────────────────────────────────────────────────

export type PMType = 'CALENDAR' | 'METER' | 'CONDITION'
export type PMFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'

// ── Sub-shapes ────────────────────────────────────────────────────────────────

export interface CalendarRule {
  frequency: PMFrequency
  interval: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  month: number | null
}

export interface MeterRule {
  meterField: string
  interval: number
  tolerance: number
}

export interface PMTask {
  sequence: number
  title: string
  instructions: string
  requiresPhoto: boolean
  requiresMeterReading: boolean
  meterReadingUnit: string | undefined
  estimatedMinutes: number
  isCritical: boolean
}

export interface UserAvatarStub {
  id: string
  name: string
  avatarUrl: string | null
}

// ── Main DTOs ─────────────────────────────────────────────────────────────────

export interface PMScheduleDto {
  id: string
  tenantId: string
  assetId: string
  assetName: string
  assetNumber: string
  title: string
  description: string
  type: PMType
  isActive: boolean
  calendarRule: CalendarRule | null
  meterRule: MeterRule | null
  taskCount: number
  estimatedHours: number
  requiredSkillIds: string[]
  defaultAssigneeIds: string[]
  advanceNoticeDays: number
  lastTriggeredAt: string | null
  nextDueAt: string | null
  isOverdue: boolean
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface PMScheduleListResult {
  items: PMScheduleDto[]
  total: number
  nextCursor: string | null
}

// ── Calendar view ─────────────────────────────────────────────────────────────

export interface PMCalendarEntry {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  type: PMType
  estimatedHours: number
  isOverdue: boolean
  assignees: UserAvatarStub[]
}

export interface PMCalendarDay {
  date: string // YYYY-MM-DD
  entries: PMCalendarEntry[]
}

export interface PMCalendarResult {
  from: string
  to: string
  days: PMCalendarDay[]
  totalEvents: number
}

// ── Upcoming ──────────────────────────────────────────────────────────────────

export interface UpcomingPMItem {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  locationName: string | null
  type: PMType
  estimatedHours: number
  nextDueAt: string
  daysUntilDue: number
  isOverdue: boolean
  assignees: UserAvatarStub[]
}

export interface UpcomingPMWeek {
  weekLabel: string
  weekStart: string
  weekEnd: string
  items: UpcomingPMItem[]
  totalEstimatedHours: number
}

export interface UpcomingPMResult {
  horizon: number
  weeks: UpcomingPMWeek[]
  overdueItems: UpcomingPMItem[]
  totalItems: number
}

// ── Compliance ────────────────────────────────────────────────────────────────

export interface PMComplianceScheduleRow {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  categoryName: string
  locationName: string | null
  type: PMType
  plannedTriggers: number
  actualTriggers: number
  compliancePct: number
  lastTriggeredAt: string | null
  nextDueAt: string | null
}

export interface PMComplianceResult {
  overallCompliancePct: number
  periodStart: string
  periodEnd: string
  schedules: PMComplianceScheduleRow[]
  byCategory: Array<{
    categoryName: string
    plannedTriggers: number
    actualTriggers: number
    compliancePct: number
  }>
  byLocation: Array<{
    locationName: string
    plannedTriggers: number
    actualTriggers: number
    compliancePct: number
  }>
  totalSchedules: number
  fullyCompliant: number
}

// ── AI suggestions ────────────────────────────────────────────────────────────

export interface PMSuggestedSchedule {
  title: string
  description: string
  frequency: PMFrequency
  interval: number
  estimatedHours: number
  advanceNoticeDays: number | undefined
  rationale: string | undefined
  tasks: PMTask[]
}

export interface PMScheduleSuggestions {
  schedules: PMSuggestedSchedule[]
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface ListPMSchedulesFilters {
  assetId?: string
  isActive?: boolean
  triggerType?: PMType
  nextDueBefore?: string
  nextDueAfter?: string
  cursor?: string
  limit?: number
}

export interface CreatePMSchedulePayload {
  assetId: string
  title: string
  description?: string
  type: PMType
  calendarRule?: {
    frequency: PMFrequency
    interval: number
    dayOfWeek?: number
    dayOfMonth?: number
    month?: number
  }
  meterRule?: { meterField: string; interval: number; tolerance: number }
  taskList: PMTask[]
  estimatedHours?: number
  requiredSkillIds?: string[]
  defaultAssigneeIds?: string[]
  advanceNoticeDays?: number
}

export interface UpdatePMSchedulePayload {
  title?: string
  description?: string
  calendarRule?: {
    frequency: PMFrequency
    interval: number
    dayOfWeek?: number
    dayOfMonth?: number
    month?: number
  } | null
  meterRule?: { meterField: string; interval: number; tolerance: number } | null
  taskList?: PMTask[]
  estimatedHours?: number
  requiredSkillIds?: string[]
  defaultAssigneeIds?: string[]
  advanceNoticeDays?: number
}

// ── Query-string helper ───────────────────────────────────────────────────────

function toQS(params: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      for (const x of v) qs.append(k, String(x))
    } else qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// ── API functions ─────────────────────────────────────────────────────────────

const BASE = '/pm-schedules'

export function listPMSchedules(f: ListPMSchedulesFilters = {}): Promise<PMScheduleListResult> {
  return apiFetch<PMScheduleListResult>(`${BASE}${toQS(f as Record<string, unknown>)}`)
}

export function getPMSchedule(id: string): Promise<PMScheduleDto & { triggerHistory: unknown[] }> {
  return apiFetch(`${BASE}/${id}`)
}

export function createPMSchedule(data: CreatePMSchedulePayload): Promise<{ id: string }> {
  return apiFetch(`${BASE}`, 'POST', data)
}

export function updatePMSchedule(id: string, data: UpdatePMSchedulePayload): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, 'PATCH', data)
}

export function deletePMSchedule(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, 'DELETE')
}

export function activatePMSchedule(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/activate`, 'POST')
}

export function deactivatePMSchedule(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/deactivate`, 'POST')
}

export function triggerPMSchedule(
  id: string,
  assigneeIds?: string[],
): Promise<{ workOrderId: string; woNumber: string; nextDueAt: string | null }> {
  return apiFetch(`${BASE}/${id}/trigger`, 'POST', { ...(assigneeIds && { assigneeIds }) })
}

export function clonePMSchedule(
  id: string,
  targetAssetId: string,
  title?: string,
): Promise<{ id: string }> {
  return apiFetch(`${BASE}/${id}/clone`, 'POST', { targetAssetId, ...(title && { title }) })
}

export function getPMCalendar(from: string, to: string): Promise<PMCalendarResult> {
  return apiFetch(`${BASE}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export function getUpcomingPM(days: 30 | 60 | 90 = 30): Promise<UpcomingPMResult> {
  return apiFetch(`${BASE}/upcoming?days=${days}`)
}

export function getPMCompliance(lookbackMonths = 12): Promise<PMComplianceResult> {
  return apiFetch(`${BASE}/compliance?lookbackMonths=${lookbackMonths}`)
}

export function suggestPMSchedules(
  assetType: string,
  manufacturer?: string,
  model?: string,
): Promise<PMScheduleSuggestions> {
  return apiFetch(`${BASE}/ai/suggest`, 'POST', {
    assetType,
    ...(manufacturer && { manufacturer }),
    ...(model && { model }),
  })
}
