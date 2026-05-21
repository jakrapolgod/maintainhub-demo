/**
 * Shared DTOs for all PM-schedule query handlers.
 * All handlers are pure read projections — Prisma rows map directly to DTOs.
 */
export type { QueryContext } from '../../work-orders/queries/query.types.js'

// ── Shared sub-shapes ─────────────────────────────────────────────────────────

export interface UserAvatarStub {
  id: string
  name: string
  avatarUrl: string | null
}

export interface TaskDto {
  sequence: number
  title: string
  instructions: string
  requiresPhoto: boolean
  requiresMeterReading: boolean
  meterReadingUnit: string | null
  estimatedMinutes: number
  isCritical: boolean
}

export interface CalendarRuleDto {
  frequency: string
  interval: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  month: number | null
}

export interface MeterRuleDto {
  meterField: string
  interval: number
  tolerance: number
}

// ── PMScheduleDto (list item) ─────────────────────────────────────────────────

export interface PMScheduleDto {
  id: string
  tenantId: string
  assetId: string
  assetName: string
  assetNumber: string
  title: string
  description: string
  type: string
  isActive: boolean
  calendarRule: CalendarRuleDto | null
  meterRule: MeterRuleDto | null
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

// ── ListPMSchedules ───────────────────────────────────────────────────────────

export interface ListPMSchedulesResult {
  items: PMScheduleDto[]
  total: number
  nextCursor: string | null
}

// ── GetPMCalendar ─────────────────────────────────────────────────────────────

export interface PMCalendarEntry {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  type: string
  estimatedHours: number
  isOverdue: boolean
  assignees: UserAvatarStub[]
}

export interface PMCalendarDay {
  /** YYYY-MM-DD */
  date: string
  entries: PMCalendarEntry[]
}

export interface PMCalendarResult {
  from: string
  to: string
  days: PMCalendarDay[]
  /** Total unique PM events in the range. */
  totalEvents: number
}

// ── GetUpcomingPM ─────────────────────────────────────────────────────────────

export interface UpcomingPMItem {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  locationName: string | null
  type: string
  estimatedHours: number
  nextDueAt: string
  daysUntilDue: number
  isOverdue: boolean
  assignees: UserAvatarStub[]
}

export interface UpcomingPMWeek {
  /** ISO week label, e.g. "2024-W23" */
  weekLabel: string
  weekStart: string
  weekEnd: string
  items: UpcomingPMItem[]
  totalEstimatedHours: number
}

export interface UpcomingPMResult {
  horizon: number // days requested (30 | 60 | 90)
  weeks: UpcomingPMWeek[]
  overdueItems: UpcomingPMItem[]
  totalItems: number
}

// ── GetPMCompliance ───────────────────────────────────────────────────────────

export interface PMComplianceScheduleRow {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  assetNumber: string
  categoryName: string
  locationName: string | null
  type: string
  plannedTriggers: number
  actualTriggers: number
  compliancePct: number // 0–100
  lastTriggeredAt: string | null
  nextDueAt: string | null
}

export interface PMComplianceCategoryBreakdown {
  categoryName: string
  plannedTriggers: number
  actualTriggers: number
  compliancePct: number
}

export interface PMComplianceLocationBreakdown {
  locationName: string
  plannedTriggers: number
  actualTriggers: number
  compliancePct: number
}

export interface PMComplianceResult {
  /** Overall compliance across all schedules (0–100). */
  overallCompliancePct: number
  periodStart: string
  periodEnd: string
  schedules: PMComplianceScheduleRow[]
  byCategory: PMComplianceCategoryBreakdown[]
  byLocation: PMComplianceLocationBreakdown[]
  totalSchedules: number
  fullyCompliant: number // schedules with compliancePct = 100
}

// ── GetPMCost ─────────────────────────────────────────────────────────────────

export interface PMCostPeriod {
  /** YYYY-MM */
  month: string
  estimatedCost: number
  actualLaborCost: number
  actualPartsCost: number
  actualTotalCost: number
  woCount: number
}

export interface PMCostScheduleRow {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
  estimatedHours: number
  /** Estimated cost = estimatedHours × average labor rate (configurable). */
  estimatedCostTotal: number
  actualLaborCostTotal: number
  actualPartsCostTotal: number
  actualTotalCost: number
  variance: number // actual - estimated (negative = under budget)
  woCount: number
}

export interface PMCostResult {
  periodStart: string
  periodEnd: string
  totalEstimatedCost: number
  totalActualCost: number
  totalVariance: number
  byMonth: PMCostPeriod[]
  bySchedule: PMCostScheduleRow[]
}
