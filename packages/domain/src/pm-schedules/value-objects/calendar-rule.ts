import { DomainException } from '../../errors/domain.exception.js'

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'

export interface CalendarRuleProps {
  frequency: Frequency
  /** Repeat every N units of frequency (e.g. every 2 weeks). */
  interval: number
  /** 0 = Sunday … 6 = Saturday.  Applies to weekly frequency only. */
  dayOfWeek: number | undefined
  /** 1–31.  Applies to monthly/quarterly/annually. Clamped to last day of month. */
  dayOfMonth: number | undefined
  /** 1–12.  Applies to annually only. */
  month: number | undefined
}

/**
 * Immutable value object describing how a PM schedule recurs on the calendar.
 *
 * Invariants:
 * - interval >= 1
 * - dayOfWeek must be 0–6 when supplied
 * - dayOfMonth must be 1–31 when supplied
 * - month must be 1–12 when supplied
 */
export class CalendarRule {
  readonly frequency: Frequency

  readonly interval: number

  readonly dayOfWeek: number | undefined

  readonly dayOfMonth: number | undefined

  readonly month: number | undefined

  constructor(props: CalendarRuleProps) {
    if (!Number.isInteger(props.interval) || props.interval < 1) {
      throw new DomainException(
        'CalendarRule interval must be a positive integer',
        'INVALID_CALENDAR_RULE',
      )
    }
    if (props.dayOfWeek !== undefined && (props.dayOfWeek < 0 || props.dayOfWeek > 6)) {
      throw new DomainException('CalendarRule dayOfWeek must be 0–6', 'INVALID_CALENDAR_RULE')
    }
    if (props.dayOfMonth !== undefined && (props.dayOfMonth < 1 || props.dayOfMonth > 31)) {
      throw new DomainException('CalendarRule dayOfMonth must be 1–31', 'INVALID_CALENDAR_RULE')
    }
    if (props.month !== undefined && (props.month < 1 || props.month > 12)) {
      throw new DomainException('CalendarRule month must be 1–12', 'INVALID_CALENDAR_RULE')
    }

    this.frequency = props.frequency
    this.interval = props.interval
    this.dayOfWeek = props.dayOfWeek
    this.dayOfMonth = props.dayOfMonth
    this.month = props.month
    Object.freeze(this)
  }

  equals(other: CalendarRule): boolean {
    return (
      this.frequency === other.frequency &&
      this.interval === other.interval &&
      this.dayOfWeek === other.dayOfWeek &&
      this.dayOfMonth === other.dayOfMonth &&
      this.month === other.month
    )
  }
}
