import Decimal from 'decimal.js'
import { DomainException } from '../../errors/domain.exception.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * ISO 4217 currency codes are 3 uppercase letters.
 * We accept any 3-letter alphabetic code rather than embedding the full list.
 */
const CURRENCY_REGEX = /^[A-Z]{3}$/

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Immutable monetary value.
 *
 * Invariants
 * ──────────
 *  • amount is never negative
 *  • currency is a 3-letter ISO 4217 uppercase code
 *  • arithmetic operations return new Money instances (immutability)
 *  • add() / subtract() enforce same-currency operands
 *  • subtract() throws rather than producing a negative result
 */
export class Money {
  readonly amount: Decimal

  readonly currency: string

  constructor(amount: Decimal | number | string, currency: string) {
    // Normalise and validate currency first so error messages are readable
    const normCurrency = currency.trim().toUpperCase()
    if (!CURRENCY_REGEX.test(normCurrency)) {
      throw new DomainException(
        `"${currency}" is not a valid ISO 4217 currency code (expected 3 uppercase letters, e.g. "THB")`,
        'INVALID_CURRENCY',
      )
    }

    // Reject non-finite JS numbers before constructing Decimal.
    // new Decimal(NaN) / new Decimal(Infinity) succeed but produce non-finite
    // Decimals — catch them here with a clear message.
    if (typeof amount === 'number' && !Number.isFinite(amount)) {
      throw new DomainException(
        'Money amount must be a finite number (NaN and Infinity are not allowed)',
        'INVALID_AMOUNT',
      )
    }

    const dec = new Decimal(amount)

    if (!dec.isFinite()) {
      throw new DomainException(
        'Money amount must be a finite number (NaN and Infinity are not allowed)',
        'INVALID_AMOUNT',
      )
    }

    if (dec.isNegative()) {
      throw new DomainException(
        `Money amount cannot be negative (got ${dec.toString()})`,
        'NEGATIVE_AMOUNT',
      )
    }

    this.amount = dec
    this.currency = normCurrency
    Object.freeze(this)
  }

  // ── Arithmetic ──────────────────────────────────────────────────────────────

  /**
   * Returns a new Money representing the sum.
   * Throws if the operands have different currencies.
   */
  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount.plus(other.amount), this.currency)
  }

  /**
   * Returns a new Money representing the difference.
   * Throws if the operands have different currencies or the result would be negative.
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    const result = this.amount.minus(other.amount)
    if (result.isNegative()) {
      throw new DomainException(
        `Cannot subtract ${other.toString()} from ${this.toString()} — result would be negative`,
        'NEGATIVE_AMOUNT',
      )
    }
    return new Money(result, this.currency)
  }

  /**
   * Multiplies the amount by a dimensionless scalar (e.g. hours).
   * Used by LaborCost and similar computations. Result is rounded to
   * 2 decimal places using ROUND_HALF_UP.
   */
  multiply(scalar: number | Decimal): Money {
    const factor = new Decimal(scalar)
    if (!factor.isFinite() || factor.isNegative()) {
      throw new DomainException(
        'Money multiplier must be a non-negative finite number',
        'INVALID_MULTIPLIER',
      )
    }
    const result = this.amount.mul(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    return new Money(result, this.currency)
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  /**
   * Two Money values are equal when both amount and currency match exactly.
   */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount)
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  /** Returns true when amount is exactly zero. */
  isZero(): boolean {
    return this.amount.isZero()
  }

  /** Human-readable representation — not intended for financial display. */
  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainException(
        `Currency mismatch: cannot combine ${this.currency} and ${other.currency}`,
        'CURRENCY_MISMATCH',
      )
    }
  }
}
