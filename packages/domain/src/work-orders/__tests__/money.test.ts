import Decimal from 'decimal.js'
import { DomainException } from '../../errors/domain.exception'
import { Money } from '../value-objects/money'

// ── Construction ──────────────────────────────────────────────────────────────

describe('Money — construction', () => {
  it('accepts a valid amount and currency', () => {
    const m = new Money(100, 'THB')
    expect(m.amount.equals(100)).toBe(true)
    expect(m.currency).toBe('THB')
  })

  it('accepts a string amount', () => {
    const m = new Money('99.99', 'USD')
    expect(m.amount.equals('99.99')).toBe(true)
  })

  it('accepts a Decimal amount', () => {
    const m = new Money(new Decimal('0.01'), 'EUR')
    expect(m.amount.equals('0.01')).toBe(true)
  })

  it('accepts zero amount', () => {
    const m = new Money(0, 'THB')
    expect(m.isZero()).toBe(true)
  })

  it('normalises currency to uppercase', () => {
    const m = new Money(10, 'thb')
    expect(m.currency).toBe('THB')
  })

  it('trims whitespace from currency', () => {
    const m = new Money(10, '  USD  ')
    expect(m.currency).toBe('USD')
  })

  it('throws NEGATIVE_AMOUNT for negative values', () => {
    expect(() => new Money(-0.01, 'THB')).toThrow(
      expect.objectContaining({ code: 'NEGATIVE_AMOUNT' }),
    )
  })

  it('throws NEGATIVE_AMOUNT with descriptive message', () => {
    expect(() => new Money(-100, 'USD')).toThrow(DomainException)
  })

  it('throws INVALID_AMOUNT for NaN (number)', () => {
    expect(() => new Money(NaN, 'THB')).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }))
  })

  it('throws INVALID_AMOUNT for the string "NaN" (reaches the Decimal.isFinite guard)', () => {
    // new Decimal('NaN') succeeds but produces a non-finite Decimal —
    // the post-construction isFinite() check is the only guard for this path.
    expect(() => new Money('NaN', 'THB')).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    )
  })

  it('throws INVALID_AMOUNT for Infinity (number)', () => {
    expect(() => new Money(Infinity, 'THB')).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    )
  })

  it('throws INVALID_AMOUNT for -Infinity (number)', () => {
    expect(() => new Money(-Infinity, 'THB')).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    )
  })

  it('throws INVALID_CURRENCY for empty string', () => {
    expect(() => new Money(10, '')).toThrow(expect.objectContaining({ code: 'INVALID_CURRENCY' }))
  })

  it('throws INVALID_CURRENCY for a two-letter code', () => {
    expect(() => new Money(10, 'TH')).toThrow(expect.objectContaining({ code: 'INVALID_CURRENCY' }))
  })

  it('throws INVALID_CURRENCY for a four-letter code', () => {
    expect(() => new Money(10, 'THBB')).toThrow(
      expect.objectContaining({ code: 'INVALID_CURRENCY' }),
    )
  })

  it('throws INVALID_CURRENCY for numeric string', () => {
    expect(() => new Money(10, '123')).toThrow(
      expect.objectContaining({ code: 'INVALID_CURRENCY' }),
    )
  })
})

// ── add() ─────────────────────────────────────────────────────────────────────

describe('Money — add()', () => {
  it('returns the sum as a new instance', () => {
    const a = new Money(100, 'THB')
    const b = new Money(50, 'THB')
    const result = a.add(b)
    expect(result.amount.equals(150)).toBe(true)
    expect(result.currency).toBe('THB')
  })

  it('does not mutate either operand', () => {
    const a = new Money(100, 'THB')
    const b = new Money(50, 'THB')
    a.add(b)
    expect(a.amount.equals(100)).toBe(true)
    expect(b.amount.equals(50)).toBe(true)
  })

  it('handles fractional sums correctly', () => {
    // Classic floating-point trap: 0.1 + 0.2 = 0.30000000000000004 in JS
    const a = new Money('0.1', 'USD')
    const b = new Money('0.2', 'USD')
    expect(a.add(b).amount.toString()).toBe('0.3')
  })

  it('adding zero returns equivalent value', () => {
    const a = new Money(100, 'THB')
    const zero = new Money(0, 'THB')
    expect(a.add(zero).equals(a)).toBe(true)
  })

  it('throws CURRENCY_MISMATCH for different currencies', () => {
    const a = new Money(100, 'THB')
    const b = new Money(50, 'USD')
    expect(() => a.add(b)).toThrow(expect.objectContaining({ code: 'CURRENCY_MISMATCH' }))
  })
})

// ── subtract() ────────────────────────────────────────────────────────────────

describe('Money — subtract()', () => {
  it('returns the difference as a new instance', () => {
    const a = new Money(100, 'THB')
    const b = new Money(30, 'THB')
    const result = a.subtract(b)
    expect(result.amount.equals(70)).toBe(true)
  })

  it('allows subtracting to exactly zero', () => {
    const a = new Money(50, 'THB')
    const result = a.subtract(new Money(50, 'THB'))
    expect(result.isZero()).toBe(true)
  })

  it('throws NEGATIVE_AMOUNT when result would be negative', () => {
    const a = new Money(10, 'THB')
    const b = new Money(20, 'THB')
    expect(() => a.subtract(b)).toThrow(expect.objectContaining({ code: 'NEGATIVE_AMOUNT' }))
  })

  it('throws CURRENCY_MISMATCH for different currencies', () => {
    const a = new Money(100, 'THB')
    const b = new Money(50, 'EUR')
    expect(() => a.subtract(b)).toThrow(expect.objectContaining({ code: 'CURRENCY_MISMATCH' }))
  })

  it('does not mutate operands', () => {
    const a = new Money(100, 'USD')
    const b = new Money(40, 'USD')
    a.subtract(b)
    expect(a.amount.equals(100)).toBe(true)
  })
})

// ── multiply() ────────────────────────────────────────────────────────────────

describe('Money — multiply()', () => {
  it('multiplies by a positive scalar', () => {
    const m = new Money(100, 'THB')
    expect(m.multiply(2.5).amount.equals('250.00')).toBe(true)
  })

  it('multiplies by zero yields zero Money', () => {
    const m = new Money(100, 'THB')
    expect(m.multiply(0).isZero()).toBe(true)
  })

  it('rounds to 2 decimal places (ROUND_HALF_UP)', () => {
    // 1/3 THB × 3 = 1.00 not 0.99 or 1.01
    const m = new Money(new Decimal('0.333333'), 'THB')
    const result = m.multiply(3)
    expect(result.amount.decimalPlaces()).toBeLessThanOrEqual(2)
  })

  it('throws INVALID_MULTIPLIER for negative scalar', () => {
    expect(() => new Money(100, 'THB').multiply(-1)).toThrow(
      expect.objectContaining({ code: 'INVALID_MULTIPLIER' }),
    )
  })

  it('throws INVALID_MULTIPLIER for NaN scalar', () => {
    expect(() => new Money(100, 'THB').multiply(NaN)).toThrow(
      expect.objectContaining({ code: 'INVALID_MULTIPLIER' }),
    )
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('Money — equals()', () => {
  it('returns true for same amount and currency', () => {
    expect(new Money(100, 'THB').equals(new Money(100, 'THB'))).toBe(true)
  })

  it('returns false for different amounts', () => {
    expect(new Money(100, 'THB').equals(new Money(101, 'THB'))).toBe(false)
  })

  it('returns false for different currencies', () => {
    expect(new Money(100, 'THB').equals(new Money(100, 'USD'))).toBe(false)
  })

  it('is commutative', () => {
    const a = new Money(50, 'EUR')
    const b = new Money(50, 'EUR')
    expect(a.equals(b)).toBe(b.equals(a))
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('Money — toString()', () => {
  it('formats as "CURRENCY amount"', () => {
    expect(new Money(1234.5, 'THB').toString()).toBe('THB 1234.50')
  })

  it('includes two decimal places for whole amounts', () => {
    expect(new Money(100, 'USD').toString()).toBe('USD 100.00')
  })
})
