/* istanbul ignore file — barrel re-exports, no logic */
// ── Value objects ──────────────────────────────────────────────────────────────
export { PMScheduleId } from './value-objects/pm-schedule-id.js'
export { CalendarRule } from './value-objects/calendar-rule.js'
export type { CalendarRuleProps, Frequency } from './value-objects/calendar-rule.js'
export { MeterRule } from './value-objects/meter-rule.js'
export { Task } from './value-objects/task.js'
export type { TaskProps } from './value-objects/task.js'
export { RequiredPart } from './value-objects/required-part.js'

// ── Domain events ──────────────────────────────────────────────────────────────
export { PMTriggeredEvent } from './events/pm-triggered.event.js'
export type { TriggerSource } from './events/pm-triggered.event.js'
export { PMScheduleActivatedEvent } from './events/pm-schedule-activated.event.js'
export { PMScheduleDeactivatedEvent } from './events/pm-schedule-deactivated.event.js'

// ── Aggregate root ─────────────────────────────────────────────────────────────
export { PMSchedule } from './PMSchedule.js'
export type { PMScheduleProps, PMType, WorkOrderDraft } from './PMSchedule.js'

// ── Repository port ────────────────────────────────────────────────────────────
export type { PMScheduleRepository } from './PMScheduleRepository.js'
