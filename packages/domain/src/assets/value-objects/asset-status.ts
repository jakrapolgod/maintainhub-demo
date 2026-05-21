import { DomainException } from '../../errors/domain.exception.js'

/**
 * AssetStatus — lifecycle status for a physical or virtual asset.
 *
 * Valid transitions (enforced by the transition table):
 *
 *   OPERATIONAL      → STANDBY, UNDER_MAINTENANCE, DECOMMISSIONED
 *   STANDBY          → OPERATIONAL, UNDER_MAINTENANCE, DECOMMISSIONED
 *   UNDER_MAINTENANCE→ OPERATIONAL, STANDBY, DECOMMISSIONED
 *   DECOMMISSIONED   → (terminal — no exits)
 *
 * Design note: an asset can move directly between OPERATIONAL/STANDBY and
 * UNDER_MAINTENANCE to handle both planned shutdowns and emergency repairs.
 * Decommissioning is final and irreversible at the domain level.
 */
export type AssetStatusValue = 'OPERATIONAL' | 'STANDBY' | 'UNDER_MAINTENANCE' | 'DECOMMISSIONED'

const VALID_STATUSES = new Set<AssetStatusValue>([
  'OPERATIONAL',
  'STANDBY',
  'UNDER_MAINTENANCE',
  'DECOMMISSIONED',
])

const TRANSITIONS: Readonly<Record<AssetStatusValue, ReadonlySet<AssetStatusValue>>> = {
  OPERATIONAL: new Set<AssetStatusValue>(['STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED']),
  STANDBY: new Set<AssetStatusValue>(['OPERATIONAL', 'UNDER_MAINTENANCE', 'DECOMMISSIONED']),
  UNDER_MAINTENANCE: new Set<AssetStatusValue>(['OPERATIONAL', 'STANDBY', 'DECOMMISSIONED']),
  DECOMMISSIONED: new Set<AssetStatusValue>(), // terminal
}

export class AssetStatus {
  readonly value: AssetStatusValue

  private constructor(value: AssetStatusValue) {
    this.value = value
    Object.freeze(this)
  }

  // ── Static factories ────────────────────────────────────────────────────────

  static readonly OPERATIONAL = new AssetStatus('OPERATIONAL')

  static readonly STANDBY = new AssetStatus('STANDBY')

  static readonly UNDER_MAINTENANCE = new AssetStatus('UNDER_MAINTENANCE')

  static readonly DECOMMISSIONED = new AssetStatus('DECOMMISSIONED')

  static from(value: string): AssetStatus {
    if (!VALID_STATUSES.has(value as AssetStatusValue)) {
      throw new DomainException(
        `"${value}" is not a valid AssetStatus. Expected one of: ${[...VALID_STATUSES].join(', ')}`,
        'INVALID_ASSET_STATUS',
      )
    }
    switch (value as AssetStatusValue) {
      case 'OPERATIONAL':
        return AssetStatus.OPERATIONAL
      case 'STANDBY':
        return AssetStatus.STANDBY
      case 'UNDER_MAINTENANCE':
        return AssetStatus.UNDER_MAINTENANCE
      case 'DECOMMISSIONED':
        return AssetStatus.DECOMMISSIONED
      /* istanbul ignore next -- guard against future enum additions */
      default:
        return AssetStatus.DECOMMISSIONED
    }
  }

  // ── Transition machine ──────────────────────────────────────────────────────

  /** Pure query — safe to call in UI render paths. */
  canTransitionTo(next: AssetStatus): boolean {
    return TRANSITIONS[this.value].has(next.value)
  }

  /**
   * Returns the `next` status when the transition is valid.
   * Throws DomainException when not permitted.
   */
  transitionTo(next: AssetStatus): AssetStatus {
    if (!this.canTransitionTo(next)) {
      throw new DomainException(
        `Cannot transition asset from ${this.value} to ${next.value}`,
        'INVALID_ASSET_STATUS_TRANSITION',
      )
    }
    return next
  }

  // ── Predicates ──────────────────────────────────────────────────────────────

  isOperational(): boolean {
    return this.value === 'OPERATIONAL'
  }

  isDecommissioned(): boolean {
    return this.value === 'DECOMMISSIONED'
  }

  isUnderMaintenance(): boolean {
    return this.value === 'UNDER_MAINTENANCE'
  }

  /** Terminal — no further status transitions are possible. */
  isTerminal(): boolean {
    return this.value === 'DECOMMISSIONED'
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  equals(other: AssetStatus): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
