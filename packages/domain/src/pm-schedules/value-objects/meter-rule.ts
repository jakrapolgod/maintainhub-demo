import { DomainException } from '../../errors/domain.exception.js'

/**
 * Immutable value object describing how a PM schedule recurs based on a meter
 * reading (e.g. every 500 operating hours, every 10,000 km).
 *
 * Invariants:
 * - meterField must be a non-empty string
 * - interval >= 1
 * - tolerance is a percentage, 0–100
 */
export class MeterRule {
  /** The name of the meter field on the asset (e.g. 'operatingHours', 'odometer'). */
  readonly meterField: string

  /** Trigger the PM every N units of this meter. */
  readonly interval: number

  /** Tolerance window expressed as a percentage of interval (0–100). */
  readonly tolerance: number

  constructor(props: { meterField: string; interval: number; tolerance: number }) {
    if (!props.meterField || props.meterField.trim().length === 0) {
      throw new DomainException(
        'MeterRule meterField must be a non-empty string',
        'INVALID_METER_RULE',
      )
    }
    if (!Number.isFinite(props.interval) || props.interval < 1) {
      throw new DomainException('MeterRule interval must be >= 1', 'INVALID_METER_RULE')
    }
    if (!Number.isFinite(props.tolerance) || props.tolerance < 0 || props.tolerance > 100) {
      throw new DomainException(
        'MeterRule tolerance must be a percentage (0–100)',
        'INVALID_METER_RULE',
      )
    }

    this.meterField = props.meterField.trim()
    this.interval = props.interval
    this.tolerance = props.tolerance
    Object.freeze(this)
  }

  /** Lower bound for triggering: interval × (1 − tolerance/100). */
  get lowerBound(): number {
    return this.interval * (1 - this.tolerance / 100)
  }

  equals(other: MeterRule): boolean {
    return (
      this.meterField === other.meterField &&
      this.interval === other.interval &&
      this.tolerance === other.tolerance
    )
  }
}
