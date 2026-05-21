import { DomainException } from '../../errors/domain.exception.js'

export interface TaskProps {
  sequence: number
  title: string
  instructions: string
  requiresPhoto: boolean
  requiresMeterReading: boolean
  meterReadingUnit: string | undefined
  estimatedMinutes: number
  isCritical: boolean
}

/**
 * Immutable value object representing a single checklist step inside a PM schedule.
 *
 * Invariants:
 * - sequence >= 1
 * - title must be non-empty
 * - estimatedMinutes >= 0
 * - when requiresMeterReading is true, meterReadingUnit should be supplied
 */
export class Task {
  readonly sequence: number

  readonly title: string

  readonly instructions: string

  readonly requiresPhoto: boolean

  readonly requiresMeterReading: boolean

  readonly meterReadingUnit: string | undefined

  readonly estimatedMinutes: number

  readonly isCritical: boolean

  constructor(props: TaskProps) {
    if (!Number.isInteger(props.sequence) || props.sequence < 1) {
      throw new DomainException('Task sequence must be a positive integer', 'INVALID_TASK')
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new DomainException('Task title must be non-empty', 'INVALID_TASK')
    }
    if (!Number.isInteger(props.estimatedMinutes) || props.estimatedMinutes < 0) {
      throw new DomainException(
        'Task estimatedMinutes must be a non-negative integer',
        'INVALID_TASK',
      )
    }

    this.sequence = props.sequence
    this.title = props.title.trim()
    this.instructions = props.instructions
    this.requiresPhoto = props.requiresPhoto
    this.requiresMeterReading = props.requiresMeterReading
    this.meterReadingUnit = props.meterReadingUnit
    this.estimatedMinutes = props.estimatedMinutes
    this.isCritical = props.isCritical
    Object.freeze(this)
  }

  /** Returns a new Task with the given sequence number (used during reorder). */
  withSequence(seq: number): Task {
    return new Task({
      sequence: seq,
      title: this.title,
      instructions: this.instructions,
      requiresPhoto: this.requiresPhoto,
      requiresMeterReading: this.requiresMeterReading,
      meterReadingUnit: this.meterReadingUnit,
      estimatedMinutes: this.estimatedMinutes,
      isCritical: this.isCritical,
    })
  }
}
