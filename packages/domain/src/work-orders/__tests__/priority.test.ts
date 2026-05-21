import { DomainException } from '../../errors/domain.exception'
import { Priority } from '../value-objects/priority'
import type { PriorityLevel } from '../value-objects/priority'

// ── Static instances ──────────────────────────────────────────────────────────

describe('Priority — static instances', () => {
  it('Priority.CRITICAL has value "CRITICAL"', () => {
    expect(Priority.CRITICAL.value).toBe('CRITICAL')
  })

  it('Priority.HIGH has value "HIGH"', () => {
    expect(Priority.HIGH.value).toBe('HIGH')
  })

  it('Priority.MEDIUM has value "MEDIUM"', () => {
    expect(Priority.MEDIUM.value).toBe('MEDIUM')
  })

  it('Priority.LOW has value "LOW"', () => {
    expect(Priority.LOW.value).toBe('LOW')
  })
})

// ── from() ────────────────────────────────────────────────────────────────────

describe('Priority.from()', () => {
  const validLevels: PriorityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

  it.each(validLevels)('accepts "%s"', (level) => {
    const p = Priority.from(level)
    expect(p.value).toBe(level)
  })

  it('returns the canonical static instance (reference equality)', () => {
    expect(Priority.from('CRITICAL')).toBe(Priority.CRITICAL)
    expect(Priority.from('HIGH')).toBe(Priority.HIGH)
    expect(Priority.from('MEDIUM')).toBe(Priority.MEDIUM)
    expect(Priority.from('LOW')).toBe(Priority.LOW)
  })

  it('throws INVALID_PRIORITY for an unknown level', () => {
    expect(() => Priority.from('URGENT')).toThrow(
      expect.objectContaining({ code: 'INVALID_PRIORITY' }),
    )
  })

  it('throws INVALID_PRIORITY for lowercase "critical"', () => {
    expect(() => Priority.from('critical')).toThrow(
      expect.objectContaining({ code: 'INVALID_PRIORITY' }),
    )
  })

  it('throws INVALID_PRIORITY for empty string', () => {
    expect(() => Priority.from('')).toThrow(DomainException)
  })

  it('throws INVALID_PRIORITY for numeric string', () => {
    expect(() => Priority.from('3')).toThrow(expect.objectContaining({ code: 'INVALID_PRIORITY' }))
  })
})

// ── urgencyScore() ────────────────────────────────────────────────────────────

describe('Priority — urgencyScore()', () => {
  it('CRITICAL returns 4 (highest)', () => {
    expect(Priority.CRITICAL.urgencyScore()).toBe(4)
  })

  it('HIGH returns 3', () => {
    expect(Priority.HIGH.urgencyScore()).toBe(3)
  })

  it('MEDIUM returns 2', () => {
    expect(Priority.MEDIUM.urgencyScore()).toBe(2)
  })

  it('LOW returns 1 (lowest)', () => {
    expect(Priority.LOW.urgencyScore()).toBe(1)
  })

  it('scores are strictly descending across all levels', () => {
    const scores = [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW].map((p) =>
      p.urgencyScore(),
    )
    scores.slice(1).forEach((score, idx) => {
      expect(scores[idx]).toBeGreaterThan(score)
    })
  })
})

// ── isMoreUrgentThan() ────────────────────────────────────────────────────────

describe('Priority — isMoreUrgentThan()', () => {
  it('CRITICAL is more urgent than HIGH', () => {
    expect(Priority.CRITICAL.isMoreUrgentThan(Priority.HIGH)).toBe(true)
  })

  it('LOW is not more urgent than MEDIUM', () => {
    expect(Priority.LOW.isMoreUrgentThan(Priority.MEDIUM)).toBe(false)
  })

  it('MEDIUM is not more urgent than itself', () => {
    expect(Priority.MEDIUM.isMoreUrgentThan(Priority.MEDIUM)).toBe(false)
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('Priority — equals()', () => {
  it('same value returns true', () => {
    expect(Priority.HIGH.equals(Priority.HIGH)).toBe(true)
    expect(Priority.HIGH.equals(Priority.from('HIGH'))).toBe(true)
  })

  it('different values return false', () => {
    expect(Priority.HIGH.equals(Priority.LOW)).toBe(false)
  })

  it('is symmetric', () => {
    expect(Priority.CRITICAL.equals(Priority.LOW)).toBe(Priority.LOW.equals(Priority.CRITICAL))
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('Priority — toString()', () => {
  it('returns the level name', () => {
    expect(Priority.CRITICAL.toString()).toBe('CRITICAL')
    expect(Priority.LOW.toString()).toBe('LOW')
  })
})
