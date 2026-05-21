import { DomainException } from '../../errors/domain.exception.js'

/**
 * Immutable value object representing a spare part that should be on hand
 * when performing this PM task.
 *
 * Invariants:
 * - partId must be non-empty
 * - quantity >= 1
 */
export class RequiredPart {
  readonly partId: string

  readonly partNumber: string

  readonly description: string

  readonly quantity: number

  readonly unitOfMeasure: string

  constructor(props: {
    partId: string
    partNumber: string
    description: string
    quantity: number
    unitOfMeasure: string
  }) {
    if (!props.partId || props.partId.trim().length === 0) {
      throw new DomainException('RequiredPart partId must be non-empty', 'INVALID_REQUIRED_PART')
    }
    if (!Number.isFinite(props.quantity) || props.quantity < 1) {
      throw new DomainException('RequiredPart quantity must be >= 1', 'INVALID_REQUIRED_PART')
    }

    this.partId = props.partId.trim()
    this.partNumber = props.partNumber
    this.description = props.description
    this.quantity = props.quantity
    this.unitOfMeasure = props.unitOfMeasure
    Object.freeze(this)
  }
}
