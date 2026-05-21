/**
 * PMSchedule — Domain Aggregate Root.
 *
 * A PMSchedule encodes *when* and *how* a Preventive Maintenance task should
 * be executed for a given asset.  It supports three trigger strategies:
 *
 *   CALENDAR  — fixed recurrence (daily, weekly, monthly, quarterly, annually)
 *   METER     — threshold-based (every N operating hours / km / cycles)
 *   CONDITION — condition-based (future: driven by sensor telemetry)
 *
 * ## Key responsibilities
 *
 * - `calculateNextDue`  — O(1) pure date arithmetic.
 * - `shouldTrigger`     — answers "is it time to fire?" without side effects.
 * - `trigger`           — advances the schedule state and emits PMTriggeredEvent.
 * - `generateWorkOrderDraft` — produces a plain DTO for the WO command handler.
 * - `activate` / `deactivate` — lifecycle transitions.
 * - `addTask` / `removeTask` / `reorderTasks` — task list management.
 */
import { DomainException } from '../errors/domain.exception.js'
import type { DomainEvent } from '../events/domain-event.js'
import { type PMScheduleId } from './value-objects/pm-schedule-id.js'
import { type CalendarRule, type Frequency } from './value-objects/calendar-rule.js'
import { type MeterRule } from './value-objects/meter-rule.js'
import { Task } from './value-objects/task.js'
import type { TaskProps } from './value-objects/task.js'
import { type RequiredPart } from './value-objects/required-part.js'
import { PMTriggeredEvent } from './events/pm-triggered.event.js'
import type { TriggerSource } from './events/pm-triggered.event.js'
import { PMScheduleActivatedEvent } from './events/pm-schedule-activated.event.js'
import { PMScheduleDeactivatedEvent } from './events/pm-schedule-deactivated.event.js'

// ── PM type discriminant ──────────────────────────────────────────────────────

export type PMType = 'CALENDAR' | 'METER' | 'CONDITION'

// ── Work-order draft (returned by generateWorkOrderDraft) ─────────────────────

export interface WorkOrderDraft {
  tenantId: string
  assetId: string
  title: string
  description: string
  estimatedHours: number
  tasks: TaskProps[]
  requiredPartIds: string[]
  requiredSkillIds: string[]
  assigneeIds: string[]
  pmScheduleId: string
}

// ── Mutable state ─────────────────────────────────────────────────────────────

interface MutableState {
  title: string
  description: string
  isActive: boolean
  taskList: Task[]
  estimatedHours: number
  requiredParts: RequiredPart[]
  requiredSkillIds: string[]
  defaultAssigneeIds: string[]
  lastTriggeredAt: Date | undefined
  nextDueAt: Date | undefined
  calendarRule: CalendarRule | undefined
  meterRule: MeterRule | undefined
  advanceNoticeDays: number
  updatedAt: Date
}

// ── Construction props ────────────────────────────────────────────────────────

export interface PMScheduleProps {
  id: PMScheduleId
  tenantId: string
  assetId: string
  type: PMType
  title: string
  description: string
  calendarRule: CalendarRule | undefined
  meterRule: MeterRule | undefined
  conditionRule: Record<string, unknown> | undefined
  taskList: Task[]
  estimatedHours: number
  requiredParts: RequiredPart[]
  requiredSkillIds: string[]
  defaultAssigneeIds: string[]
  isActive: boolean
  lastTriggeredAt: Date | undefined
  nextDueAt: Date | undefined
  advanceNoticeDays: number
  createdById: string
  createdAt: Date
  updatedAt: Date
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export class PMSchedule {
  // ── Identity (immutable) ────────────────────────────────────────────────────
  readonly id: PMScheduleId

  readonly tenantId: string

  readonly assetId: string

  readonly type: PMType

  readonly createdById: string

  readonly createdAt: Date

  /** Condition rule — opaque blob for now (future: sensor predicate DSL). */
  readonly conditionRule: Record<string, unknown> | undefined

  // ── Mutable state ───────────────────────────────────────────────────────────
  private state: MutableState

  private domainEvents: DomainEvent[]

  private constructor(props: PMScheduleProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.assetId = props.assetId
    this.type = props.type
    this.createdById = props.createdById
    this.createdAt = props.createdAt
    this.conditionRule = props.conditionRule

    this.state = {
      title: props.title,
      description: props.description,
      isActive: props.isActive,
      taskList: [...props.taskList],
      estimatedHours: props.estimatedHours,
      requiredParts: [...props.requiredParts],
      requiredSkillIds: [...props.requiredSkillIds],
      defaultAssigneeIds: [...props.defaultAssigneeIds],
      lastTriggeredAt: props.lastTriggeredAt,
      nextDueAt: props.nextDueAt,
      calendarRule: props.calendarRule,
      meterRule: props.meterRule,
      advanceNoticeDays: props.advanceNoticeDays,
      updatedAt: props.updatedAt,
    }

    this.domainEvents = []
  }

  // ── Factory: create ─────────────────────────────────────────────────────────

  static create(
    props: Omit<
      PMScheduleProps,
      'isActive' | 'lastTriggeredAt' | 'nextDueAt' | 'createdAt' | 'updatedAt'
    > & {
      isActive?: boolean
      lastTriggeredAt?: Date
      nextDueAt?: Date
      createdAt?: Date
    },
  ): PMSchedule {
    PMSchedule.assertValidType(props.type, props.calendarRule, props.meterRule)

    const now = new Date()
    const schedule = new PMSchedule({
      ...props,
      isActive: props.isActive ?? false,
      lastTriggeredAt: props.lastTriggeredAt,
      nextDueAt: props.nextDueAt,
      createdAt: props.createdAt ?? now,
      updatedAt: now,
    })

    // Compute initial nextDueAt for calendar schedules
    if (
      props.type === 'CALENDAR' &&
      props.calendarRule !== undefined &&
      schedule.state.nextDueAt === undefined
    ) {
      schedule.state.nextDueAt = PMSchedule.calculateNextDue(now, props.calendarRule)
    }

    return schedule
  }

  // ── Factory: reconstitute (no events) ──────────────────────────────────────

  static reconstitute(props: PMScheduleProps): PMSchedule {
    return new PMSchedule(props)
  }

  // ── Event drain ─────────────────────────────────────────────────────────────

  pullEvents(): DomainEvent[] {
    const events = [...this.domainEvents]
    this.domainEvents = []
    return events
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get title(): string {
    return this.state.title
  }

  get description(): string {
    return this.state.description
  }

  get isActive(): boolean {
    return this.state.isActive
  }

  get taskList(): readonly Task[] {
    return this.state.taskList
  }

  get estimatedHours(): number {
    return this.state.estimatedHours
  }

  get requiredParts(): readonly RequiredPart[] {
    return this.state.requiredParts
  }

  get requiredSkillIds(): readonly string[] {
    return this.state.requiredSkillIds
  }

  get defaultAssigneeIds(): readonly string[] {
    return this.state.defaultAssigneeIds
  }

  get lastTriggeredAt(): Date | undefined {
    return this.state.lastTriggeredAt
  }

  get nextDueAt(): Date | undefined {
    return this.state.nextDueAt
  }

  get calendarRule(): CalendarRule | undefined {
    return this.state.calendarRule
  }

  get meterRule(): MeterRule | undefined {
    return this.state.meterRule
  }

  get advanceNoticeDays(): number {
    return this.state.advanceNoticeDays
  }

  get updatedAt(): Date {
    return this.state.updatedAt
  }

  // ── Business method: calculateNextDue ─────────────────────────────────────
  /**
   * Pure date arithmetic — no side effects.  Used both internally and by the
   * scheduler service to preview upcoming due dates.
   *
   * Edge-case handling:
   * - Monthly/quarterly/annually with dayOfMonth > last day of target month →
   *   clamped to last day of that month (e.g. Feb 31 → Feb 28/29).
   * - Quarterly advances by 3 × interval months.
   */
  static calculateNextDue(fromDate: Date, rule: CalendarRule): Date {
    const d = new Date(fromDate)

    switch (rule.frequency) {
      case 'daily': {
        d.setDate(d.getDate() + rule.interval)
        return d
      }

      case 'weekly': {
        // Advance by N weeks
        d.setDate(d.getDate() + rule.interval * 7)
        // If dayOfWeek is specified, snap to the next occurrence of that day
        if (rule.dayOfWeek !== undefined) {
          const current = d.getDay()
          const diff = (rule.dayOfWeek - current + 7) % 7
          d.setDate(d.getDate() + diff)
        }
        return d
      }

      case 'monthly': {
        const targetDay = rule.dayOfMonth ?? d.getDate()
        // Set to the 1st before advancing months to prevent overflow
        // (e.g. Jan 31 + 1 month would become Mar 2 without this guard).
        d.setDate(1)
        d.setMonth(d.getMonth() + rule.interval)
        return PMSchedule.clampToLastDay(d, targetDay)
      }

      case 'quarterly': {
        const targetDay = rule.dayOfMonth ?? d.getDate()
        d.setDate(1)
        d.setMonth(d.getMonth() + rule.interval * 3)
        return PMSchedule.clampToLastDay(d, targetDay)
      }

      case 'annually': {
        const targetDay = rule.dayOfMonth ?? d.getDate()
        const targetMonth = rule.month !== undefined ? rule.month - 1 : d.getMonth()
        d.setDate(1)
        d.setFullYear(d.getFullYear() + rule.interval)
        d.setMonth(targetMonth)
        return PMSchedule.clampToLastDay(d, targetDay)
      }

      /* istanbul ignore next */
      default: {
        // Exhaustiveness guard — TypeScript should prevent reaching here.
        const exhausted: never = rule.frequency
        throw new DomainException(
          `Unknown frequency: ${String(exhausted)}`,
          'INVALID_CALENDAR_RULE',
        )
      }
    }
  }

  // ── Business method: shouldTrigger ────────────────────────────────────────
  /**
   * Answers "should this schedule fire right now?" without mutating state.
   *
   * Calendar:  fires when `now >= nextDueAt - advanceNoticeDays`.
   * Meter:     fires when `currentMeterReading >= lastReading + lowerBound`.
   * Condition: always returns false (future implementation).
   */
  shouldTrigger(currentMeterReading: number | undefined, now: Date): boolean {
    if (!this.state.isActive) return false

    if (this.type === 'CALENDAR') {
      if (this.state.nextDueAt === undefined) return false
      const advanceMs = this.state.advanceNoticeDays * 24 * 60 * 60 * 1000
      return now.getTime() >= this.state.nextDueAt.getTime() - advanceMs
    }

    if (this.type === 'METER') {
      if (this.state.meterRule === undefined || currentMeterReading === undefined) return false
      const lastReading =
        this.state.lastTriggeredAt !== undefined
          ? currentMeterReading // simplified: caller supplies current absolute reading
          : 0
      // The trigger fires when the reading has advanced by at least lowerBound
      // since the last trigger.  We keep it simple: compare against lowerBound.
      return currentMeterReading >= lastReading + this.state.meterRule.lowerBound
    }

    return false
  }

  // ── Business method: trigger ──────────────────────────────────────────────

  trigger(triggeredBy: TriggerSource): PMTriggeredEvent {
    if (!this.state.isActive) {
      throw new DomainException('Cannot trigger an inactive PM schedule', 'PM_SCHEDULE_INACTIVE')
    }

    const now = new Date()
    this.state.lastTriggeredAt = now

    // Advance nextDueAt for calendar schedules.
    // Base the next cycle on the *scheduled* due date (not the actual trigger
    // time) so that early triggers (within the advance-notice window) don't
    // cause calendar drift.
    if (this.type === 'CALENDAR' && this.state.calendarRule !== undefined) {
      const base = this.state.nextDueAt ?? now
      this.state.nextDueAt = PMSchedule.calculateNextDue(base, this.state.calendarRule)
    }

    this.state.updatedAt = now

    const event = new PMTriggeredEvent({
      aggregateId: this.id.value,
      tenantId: this.tenantId,
      assetId: this.assetId,
      title: this.state.title,
      triggeredBy,
      triggeredAt: now,
      nextDueAt: this.state.nextDueAt,
    })

    this.domainEvents.push(event)
    return event
  }

  // ── Business method: generateWorkOrderDraft ───────────────────────────────

  generateWorkOrderDraft(): WorkOrderDraft {
    return {
      tenantId: this.tenantId,
      assetId: this.assetId,
      title: `[PM] ${this.state.title}`,
      description: this.state.description,
      estimatedHours: this.state.estimatedHours,
      tasks: this.state.taskList.map((t) => ({
        sequence: t.sequence,
        title: t.title,
        instructions: t.instructions,
        requiresPhoto: t.requiresPhoto,
        requiresMeterReading: t.requiresMeterReading,
        meterReadingUnit: t.meterReadingUnit,
        estimatedMinutes: t.estimatedMinutes,
        isCritical: t.isCritical,
      })),
      requiredPartIds: this.state.requiredParts.map((p) => p.partId),
      requiredSkillIds: [...this.state.requiredSkillIds],
      assigneeIds: [...this.state.defaultAssigneeIds],
      pmScheduleId: this.id.value,
    }
  }

  // ── Business method: activate / deactivate ───────────────────────────────

  activate(activatedBy: string): void {
    if (this.state.isActive) {
      throw new DomainException('PM schedule is already active', 'PM_SCHEDULE_ALREADY_ACTIVE')
    }

    this.state.isActive = true
    this.state.updatedAt = new Date()

    // Recompute nextDueAt from now when re-activating
    if (this.type === 'CALENDAR' && this.state.calendarRule !== undefined) {
      this.state.nextDueAt = PMSchedule.calculateNextDue(new Date(), this.state.calendarRule)
    }

    this.domainEvents.push(
      new PMScheduleActivatedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetId: this.assetId,
        activatedBy,
      }),
    )
  }

  deactivate(deactivatedBy: string): void {
    if (!this.state.isActive) {
      throw new DomainException('PM schedule is already inactive', 'PM_SCHEDULE_ALREADY_INACTIVE')
    }

    this.state.isActive = false
    this.state.updatedAt = new Date()

    this.domainEvents.push(
      new PMScheduleDeactivatedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetId: this.assetId,
        deactivatedBy,
      }),
    )
  }

  // ── Business method: addTask ─────────────────────────────────────────────

  addTask(taskProps: TaskProps): void {
    const exists = this.state.taskList.some((t) => t.sequence === taskProps.sequence)
    if (exists) {
      throw new DomainException(
        `A task with sequence ${taskProps.sequence} already exists`,
        'DUPLICATE_TASK_SEQUENCE',
      )
    }
    this.state.taskList = [...this.state.taskList, new Task(taskProps)].sort(
      (a, b) => a.sequence - b.sequence,
    )
    this.state.updatedAt = new Date()
  }

  // ── Business method: removeTask ──────────────────────────────────────────

  removeTask(sequence: number): void {
    const before = this.state.taskList.length
    this.state.taskList = this.state.taskList.filter((t) => t.sequence !== sequence)
    if (this.state.taskList.length === before) {
      throw new DomainException(`No task with sequence ${sequence}`, 'TASK_NOT_FOUND')
    }
    this.state.updatedAt = new Date()
  }

  // ── Business method: reorderTasks ────────────────────────────────────────
  /**
   * Accepts a list of task IDs (by title, as tasks have no separate ID) in the
   * desired order and reassigns contiguous sequence numbers starting at 1.
   *
   * @param orderedTitles — task titles in the desired display order.
   */
  reorderTasks(orderedTitles: string[]): void {
    if (orderedTitles.length !== this.state.taskList.length) {
      throw new DomainException(
        'orderedTitles length must match current task count',
        'TASK_REORDER_MISMATCH',
      )
    }

    const byTitle = new Map(this.state.taskList.map((t) => [t.title, t]))
    const reordered: Task[] = []

    orderedTitles.forEach((title, idx) => {
      const task = byTitle.get(title)
      if (task === undefined) {
        throw new DomainException(`Unknown task title: "${title}"`, 'TASK_NOT_FOUND')
      }
      reordered.push(task.withSequence(idx + 1))
    })

    this.state.taskList = reordered
    this.state.updatedAt = new Date()
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private static assertValidType(
    type: PMType,
    calendarRule: CalendarRule | undefined,
    meterRule: MeterRule | undefined,
  ): void {
    if (type === 'CALENDAR' && calendarRule === undefined) {
      throw new DomainException(
        'CALENDAR PM schedule requires a calendarRule',
        'MISSING_CALENDAR_RULE',
      )
    }
    if (type === 'METER' && meterRule === undefined) {
      throw new DomainException('METER PM schedule requires a meterRule', 'MISSING_METER_RULE')
    }
  }

  /**
   * Sets the day-of-month on `d`, clamping to the last valid day when the
   * requested day exceeds the month length (e.g. 31 Jan + 1 month → 28/29 Feb).
   *
   * JavaScript's `Date.setDate()` overflows into the next month if the day is
   * too large (e.g. Feb 31 → Mar 3).  We avoid that by computing the last day
   * of the target month first and then taking the minimum.
   */
  private static clampToLastDay(d: Date, requestedDay: number): Date {
    const year = d.getFullYear()
    const month = d.getMonth() // 0-based, already set to target month
    // Day 0 of next month = last day of current month
    const lastDay = new Date(year, month + 1, 0).getDate()
    d.setDate(Math.min(requestedDay, lastDay))
    return d
  }
}

// ── Frequency re-export (convenience) ─────────────────────────────────────────
export type { Frequency }
