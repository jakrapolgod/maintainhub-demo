import { DomainException } from '../../errors/domain.exception.js'

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Permit To Work (PTW) — a safety authorisation required before certain
 * high-risk work orders can be completed.
 *
 * Invariants
 * ──────────
 *  • Immutable — `sign()` returns a *new* PermitToWork, never mutates.
 *  • Signing requires a non-empty `signedBy` identifier.
 *  • An already-signed PTW cannot be signed again.
 *  • `permitNumber` must be non-empty.
 */
export class PermitToWork {
  readonly permitNumber: string

  readonly issuedAt: Date

  readonly signedAt: Date | undefined

  readonly signedBy: string | undefined

  private constructor(
    permitNumber: string,
    issuedAt: Date,
    signedAt: Date | undefined,
    signedBy: string | undefined,
  ) {
    this.permitNumber = permitNumber
    this.issuedAt = issuedAt
    this.signedAt = signedAt
    this.signedBy = signedBy
    Object.freeze(this)
  }

  // ── Factories ───────────────────────────────────────────────────────────────

  /** Issue a new, unsigned PTW. */
  static issue(permitNumber: string): PermitToWork {
    if (!permitNumber.trim()) {
      throw new DomainException('Permit number must not be empty', 'INVALID_PERMIT_NUMBER')
    }
    return new PermitToWork(permitNumber.trim(), new Date(), undefined, undefined)
  }

  /**
   * Reconstruct a PTW from persisted data — bypasses the issue validation
   * so the application can reload signed PTWs from the database.
   */
  static reconstitute(data: {
    permitNumber: string
    issuedAt: Date
    signedAt?: Date
    signedBy?: string
  }): PermitToWork {
    return new PermitToWork(data.permitNumber, data.issuedAt, data.signedAt, data.signedBy)
  }

  // ── Domain behaviour ────────────────────────────────────────────────────────

  /** Returns true when the PTW has been signed. */
  isSigned(): boolean {
    return this.signedAt !== undefined && this.signedBy !== undefined
  }

  /**
   * Returns a new PTW instance that records the signature.
   * Throws if the PTW was already signed.
   */
  sign(signedBy: string): PermitToWork {
    if (!signedBy.trim()) {
      throw new DomainException('Signer identifier must not be empty', 'INVALID_SIGNER')
    }
    if (this.isSigned()) {
      throw new DomainException(
        `Permit ${this.permitNumber} has already been signed`,
        'PTW_ALREADY_SIGNED',
      )
    }
    return new PermitToWork(this.permitNumber, this.issuedAt, new Date(), signedBy.trim())
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  equals(other: PermitToWork): boolean {
    return (
      this.permitNumber === other.permitNumber &&
      this.issuedAt.getTime() === other.issuedAt.getTime() &&
      this.signedAt?.getTime() === other.signedAt?.getTime() &&
      this.signedBy === other.signedBy
    )
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  toString(): string {
    // isSigned() guarantees signedBy is defined when the truthy branch executes,
    // so the non-null assertion is safe here.
    return this.isSigned()
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        `PTW ${this.permitNumber} (signed by ${this.signedBy!})`
      : `PTW ${this.permitNumber} (unsigned)`
  }
}
