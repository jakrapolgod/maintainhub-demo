import { DomainException } from '../../errors/domain.exception'
import { LaborCost } from '../value-objects/labor-cost'
import { Money } from '../value-objects/money'

// ── Helpers ───────────────────────────────────────────────────────────────────

const thb = (amount: number | string) => new Money(amount, 'THB')
const usd = (amount: number | string) => new Money(amount, 'USD')

// ── Construction ──────────────────────────────────────────────────────────────

describe('LaborCost — construction', () => {
  it('accepts valid hours and rate', () => {
    const lc = new LaborCost(2, thb(500))
    expect(lc.hours).toBe(2)
    expect(lc.rate.equals(thb(500))).toBe(true)
  })

  it('accepts fractional hours (quarter-hour increment)', () => {
    const lc = new LaborCost(0.25, thb(400))
    expect(lc.hours).toBe(0.25)
  })

  it('accepts the maximum allowed hours (40)', () => {
    expect(() => new LaborCost(40, thb(100))).not.toThrow()
  })

  const makeLC = (hours: number) => () => new LaborCost(hours, thb(500))

  it('throws INVALID_HOURS for zero hours', () => {
    expect(makeLC(0)).toThrow(expect.objectContaining({ code: 'INVALID_HOURS' }))
  })

  it('throws INVALID_HOURS for negative hours', () => {
    expect(makeLC(-1)).toThrow(expect.objectContaining({ code: 'INVALID_HOURS' }))
  })

  it('throws INVALID_HOURS for NaN hours', () => {
    expect(makeLC(NaN)).toThrow(expect.objectContaining({ code: 'INVALID_HOURS' }))
  })

  it('throws INVALID_HOURS for Infinity hours', () => {
    expect(makeLC(Infinity)).toThrow(expect.objectContaining({ code: 'INVALID_HOURS' }))
  })

  it('throws INVALID_HOURS when hours exceed the maximum (40)', () => {
    expect(() => new LaborCost(40.01, thb(100))).toThrow(
      expect.objectContaining({ code: 'INVALID_HOURS' }),
    )
  })

  it('throws DomainException (not generic Error) for invalid hours', () => {
    expect(makeLC(-1)).toThrow(DomainException)
  })

  it('error message includes the invalid hours value', () => {
    let msg = ''
    try {
      makeLC(-5)()
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('-5')
  })
})

// ── Immutability ──────────────────────────────────────────────────────────────

describe('LaborCost — immutability', () => {
  it('hours property is non-writable (Object.freeze)', () => {
    const lc = new LaborCost(2, thb(100))
    expect(Object.isFrozen(lc)).toBe(true)
    // Assigning to a frozen object in strict mode throws TypeError
    expect(() => {
      ;(lc as any).hours = 99
    }).toThrow(TypeError)
  })

  it('rate property is non-writable (Object.freeze)', () => {
    const lc = new LaborCost(2, thb(100))
    expect(() => {
      ;(lc as any).rate = thb(999)
    }).toThrow(TypeError)
  })
})

// ── total() ───────────────────────────────────────────────────────────────────

describe('LaborCost — total()', () => {
  it('computes integer hours × integer rate', () => {
    const lc = new LaborCost(2, thb(500))
    expect(lc.total().equals(thb(1000))).toBe(true)
  })

  it('computes fractional hours correctly (1.5h × 400 = 600)', () => {
    const lc = new LaborCost(1.5, thb(400))
    expect(lc.total().equals(thb(600))).toBe(true)
  })

  it('computes quarter-hour entry (0.25h × 200 = 50)', () => {
    const lc = new LaborCost(0.25, thb(200))
    expect(lc.total().equals(thb(50))).toBe(true)
  })

  it('preserves currency from rate', () => {
    const lc = new LaborCost(3, usd(80))
    expect(lc.total().currency).toBe('USD')
    expect(lc.total().equals(usd(240))).toBe(true)
  })

  it('rounds result to 2 decimal places', () => {
    // 1/3 hour × THB 1 = THB 0.33 (ROUND_HALF_UP)
    const lc = new LaborCost(1 / 3, thb(1))
    const total = lc.total()
    expect(total.amount.decimalPlaces()).toBeLessThanOrEqual(2)
  })

  it('returns a zero-cost Money for minimum inputs (non-zero hours, zero rate)', () => {
    const lc = new LaborCost(1, thb(0))
    expect(lc.total().isZero()).toBe(true)
  })

  it('returns a new Money instance each call (not cached reference)', () => {
    const lc = new LaborCost(2, thb(100))
    expect(lc.total()).not.toBe(lc.total()) // different object references
    expect(lc.total().equals(lc.total())).toBe(true) // same value
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('LaborCost — equals()', () => {
  it('returns true for same hours and rate', () => {
    const a = new LaborCost(2, thb(500))
    const b = new LaborCost(2, thb(500))
    expect(a.equals(b)).toBe(true)
  })

  it('returns false for different hours', () => {
    expect(new LaborCost(2, thb(500)).equals(new LaborCost(3, thb(500)))).toBe(false)
  })

  it('returns false for different rate amount', () => {
    expect(new LaborCost(2, thb(500)).equals(new LaborCost(2, thb(600)))).toBe(false)
  })

  it('returns false for different rate currency', () => {
    expect(new LaborCost(2, thb(500)).equals(new LaborCost(2, usd(500)))).toBe(false)
  })

  it('is symmetric', () => {
    const a = new LaborCost(4, thb(300))
    const b = new LaborCost(4, thb(300))
    expect(a.equals(b)).toBe(b.equals(a))
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('LaborCost — toString()', () => {
  it('includes hours, rate, and total', () => {
    const lc = new LaborCost(2, thb(500))
    const str = lc.toString()
    expect(str).toContain('2')
    expect(str).toContain('500')
    expect(str).toContain('1000')
    expect(str).toContain('THB')
  })
})

// ── Cross-value-object integration ───────────────────────────────────────────

describe('LaborCost + Money integration', () => {
  it('two labor entries can be summed via Money.add()', () => {
    const entry1 = new LaborCost(2, thb(500))
    const entry2 = new LaborCost(1.5, thb(400))
    const totalCost = entry1.total().add(entry2.total())
    // 2×500 + 1.5×400 = 1000 + 600 = 1600
    expect(totalCost.equals(thb(1600))).toBe(true)
  })

  it('labor costs in different currencies cannot be summed', () => {
    const entry1 = new LaborCost(2, thb(500))
    const entry2 = new LaborCost(1, usd(20))
    expect(() => entry1.total().add(entry2.total())).toThrow(
      expect.objectContaining({ code: 'CURRENCY_MISMATCH' }),
    )
  })
})
