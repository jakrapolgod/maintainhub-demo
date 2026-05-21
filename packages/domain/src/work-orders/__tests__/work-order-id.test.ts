import { DomainException } from '../../errors/domain.exception'
import { WorkOrderId } from '../value-objects/work-order-id'

// Realistic CUID v1 samples (25 chars: 'c' + 24 lowercase alphanumeric)
const VALID_CUID = 'clh7z2d1h0000z1x1z1x1z1x1'
const VALID_CUID_2 = 'cm9pq3r2i0000ymbj1nhq1zr2'

// ── Construction ──────────────────────────────────────────────────────────────

describe('WorkOrderId — construction', () => {
  it('accepts a valid CUID v1', () => {
    const id = new WorkOrderId(VALID_CUID)
    expect(id.value).toBe(VALID_CUID)
  })

  it('accepts a second valid CUID sample', () => {
    const id = new WorkOrderId(VALID_CUID_2)
    expect(id.value).toBe(VALID_CUID_2)
  })

  it('accepts a CUID v2-style ID (24 chars, letter prefix)', () => {
    // CUID v2: 24 chars, starts with any lowercase letter
    const id24 = 'abcdefghij0123456789abcd'
    const id = new WorkOrderId(id24)
    expect(id.value).toBe(id24)
  })

  it('throws INVALID_WORK_ORDER_ID for empty string', () => {
    expect(() => new WorkOrderId('')).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for UUID format (wrong shape)', () => {
    expect(() => new WorkOrderId('550e8400-e29b-41d4-a716-446655440000')).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for uppercase letters', () => {
    const upper = VALID_CUID.toUpperCase()
    expect(() => new WorkOrderId(upper)).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for a 23-char string (too short for either CUID variant)', () => {
    // v1 needs 25 chars (c + 24); v2 needs 24 chars (letter + 23) — 23 chars matches neither
    expect(() => new WorkOrderId(`c${'0'.repeat(22)}`)).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for a string that is too long', () => {
    expect(() => new WorkOrderId(`c${'0'.repeat(25)}`)).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for special characters', () => {
    expect(() => new WorkOrderId(`c${'-'.repeat(24)}`)).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('throws INVALID_WORK_ORDER_ID for plain integers', () => {
    expect(() => new WorkOrderId('12345')).toThrow(
      expect.objectContaining({ code: 'INVALID_WORK_ORDER_ID' }),
    )
  })

  it('is a DomainException', () => {
    expect(() => new WorkOrderId('')).toThrow(DomainException)
  })
})

// ── Immutability ──────────────────────────────────────────────────────────────

describe('WorkOrderId — immutability', () => {
  it('value property is non-writable (Object.freeze)', () => {
    const id = new WorkOrderId(VALID_CUID)
    expect(Object.isFrozen(id)).toBe(true)
    expect(() => {
      ;(id as any).value = 'something-else'
    }).toThrow(TypeError)
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('WorkOrderId — equals()', () => {
  it('returns true for the same underlying value', () => {
    const a = new WorkOrderId(VALID_CUID)
    const b = new WorkOrderId(VALID_CUID)
    expect(a.equals(b)).toBe(true)
  })

  it('returns false for different values', () => {
    const a = new WorkOrderId(VALID_CUID)
    const b = new WorkOrderId(VALID_CUID_2)
    expect(a.equals(b)).toBe(false)
  })

  it('is commutative', () => {
    const a = new WorkOrderId(VALID_CUID)
    const b = new WorkOrderId(VALID_CUID_2)
    expect(a.equals(b)).toBe(b.equals(a))
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('WorkOrderId — toString()', () => {
  it('returns the raw string value', () => {
    const id = new WorkOrderId(VALID_CUID)
    expect(id.toString()).toBe(VALID_CUID)
    expect(String(id)).toBe(VALID_CUID)
  })
})
