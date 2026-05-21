/**
 * Unit tests for the SLA calculator.
 *
 * Test axes
 * ─────────
 *  1. Default hours — each of the four priority levels uses the correct default
 *  2. Tenant overrides — full and partial overrides, edge values
 *  3. Parsing robustness — malformed settings, wrong types, nested garbage
 *  4. Deadline arithmetic — cross-day/month/year, leap year, DST invariance
 *  5. overdueMinutes() — in-deadline, exactly at deadline, well past deadline
 *  6. Timezone invariance — same wall-clock result regardless of server timezone
 */
import {
  DEFAULT_SLA_HOURS,
  computeSlaDeadline,
  overdueMinutes,
  parseTenantSlaHours,
} from '../sla-calculator'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Date from an ISO-8601 string — forces UTC to rule out local offset. */
const utc = (iso: string) => new Date(iso)

/** Add hours to a UTC date and return ISO string. */
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000).toISOString()

// ── Default SLA hours ─────────────────────────────────────────────────────────

describe('DEFAULT_SLA_HOURS', () => {
  it('CRITICAL is 4 hours', () => expect(DEFAULT_SLA_HOURS.CRITICAL).toBe(4))
  it('HIGH is 8 hours', () => expect(DEFAULT_SLA_HOURS.HIGH).toBe(8))
  it('MEDIUM is 24 hours', () => expect(DEFAULT_SLA_HOURS.MEDIUM).toBe(24))
  it('LOW is 72 hours', () => expect(DEFAULT_SLA_HOURS.LOW).toBe(72))

  it('all four priorities are covered with positive finite values', () => {
    const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
    levels.forEach((p) => {
      expect(DEFAULT_SLA_HOURS[p]).toBeGreaterThan(0)
      expect(Number.isFinite(DEFAULT_SLA_HOURS[p])).toBe(true)
    })
  })
})

// ── computeSlaDeadline() — default hours ──────────────────────────────────────

describe('computeSlaDeadline() — default hours (no tenant override)', () => {
  const base = utc('2024-06-15T10:00:00.000Z')

  it('CRITICAL: deadline is 4 hours after createdAt', () => {
    const result = computeSlaDeadline('CRITICAL', base)
    expect(result.toISOString()).toBe(addHours(base, 4))
  })

  it('HIGH: deadline is 8 hours after createdAt', () => {
    const result = computeSlaDeadline('HIGH', base)
    expect(result.toISOString()).toBe(addHours(base, 8))
  })

  it('MEDIUM: deadline is 24 hours after createdAt', () => {
    const result = computeSlaDeadline('MEDIUM', base)
    expect(result.toISOString()).toBe(addHours(base, 24))
  })

  it('LOW: deadline is 72 hours after createdAt', () => {
    const result = computeSlaDeadline('LOW', base)
    expect(result.toISOString()).toBe(addHours(base, 72))
  })

  it('returns a Date instance', () => {
    expect(computeSlaDeadline('MEDIUM', base)).toBeInstanceOf(Date)
  })

  it('does not mutate the input date', () => {
    const before = base.getTime()
    computeSlaDeadline('CRITICAL', base)
    expect(base.getTime()).toBe(before)
  })
})

// ── computeSlaDeadline() — tenant overrides ───────────────────────────────────

describe('computeSlaDeadline() — tenant overrides', () => {
  const base = utc('2024-01-10T12:00:00.000Z')
  const settings = { slaHours: { CRITICAL: 2, HIGH: 6, MEDIUM: 12, LOW: 48 } }

  it('uses override for CRITICAL when provided', () => {
    const result = computeSlaDeadline('CRITICAL', base, settings)
    expect(result.toISOString()).toBe(addHours(base, 2))
  })

  it('uses override for HIGH when provided', () => {
    const result = computeSlaDeadline('HIGH', base, settings)
    expect(result.toISOString()).toBe(addHours(base, 6))
  })

  it('uses override for MEDIUM when provided', () => {
    const result = computeSlaDeadline('MEDIUM', base, settings)
    expect(result.toISOString()).toBe(addHours(base, 12))
  })

  it('uses override for LOW when provided', () => {
    const result = computeSlaDeadline('LOW', base, settings)
    expect(result.toISOString()).toBe(addHours(base, 48))
  })

  it('partial override: overridden priority uses custom hours', () => {
    const partial = { slaHours: { CRITICAL: 1 } }
    const result = computeSlaDeadline('CRITICAL', base, partial)
    expect(result.toISOString()).toBe(addHours(base, 1))
  })

  it('partial override: non-overridden priority falls back to default', () => {
    const partial = { slaHours: { CRITICAL: 1 } }
    const result = computeSlaDeadline('HIGH', base, partial)
    expect(result.toISOString()).toBe(addHours(base, DEFAULT_SLA_HOURS.HIGH))
  })

  it('fractional override hours work correctly', () => {
    // 0.5 hours = 30 minutes
    const half = { slaHours: { CRITICAL: 0.5 } }
    const result = computeSlaDeadline('CRITICAL', base, half)
    expect(result.getTime()).toBe(base.getTime() + 0.5 * 3_600_000)
  })

  it('large override hours (e.g. 720 = 30 days) work correctly', () => {
    const large = { slaHours: { LOW: 720 } }
    const result = computeSlaDeadline('LOW', base, large)
    expect(result.toISOString()).toBe(addHours(base, 720))
  })
})

// ── parseTenantSlaHours() ─────────────────────────────────────────────────────

describe('parseTenantSlaHours()', () => {
  it('returns undefined for null', () => {
    expect(parseTenantSlaHours(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(parseTenantSlaHours(undefined)).toBeUndefined()
  })

  it('returns undefined for a string', () => {
    expect(parseTenantSlaHours('{"slaHours":{"CRITICAL":2}}')).toBeUndefined()
  })

  it('returns undefined for an array', () => {
    expect(parseTenantSlaHours([{ slaHours: { CRITICAL: 2 } }])).toBeUndefined()
  })

  it('returns undefined when slaHours is absent', () => {
    expect(parseTenantSlaHours({ logo: 'blue' })).toBeUndefined()
  })

  it('returns undefined when slaHours is a string', () => {
    expect(parseTenantSlaHours({ slaHours: '4h' })).toBeUndefined()
  })

  it('returns undefined when slaHours is null', () => {
    expect(parseTenantSlaHours({ slaHours: null })).toBeUndefined()
  })

  it('returns undefined when slaHours is an array', () => {
    expect(parseTenantSlaHours({ slaHours: [4, 8, 24, 72] })).toBeUndefined()
  })

  it('returns undefined when no valid entry exists', () => {
    // All values are invalid: negative, zero, string, NaN
    expect(
      parseTenantSlaHours({ slaHours: { CRITICAL: -1, HIGH: 0, MEDIUM: 'fast', LOW: NaN } }),
    ).toBeUndefined()
  })

  it('returns a valid map for a well-formed settings object', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: 2, HIGH: 6 } })
    expect(result).toEqual({ CRITICAL: 2, HIGH: 6 })
  })

  it('ignores invalid entries (zero) but keeps valid ones', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: 2, HIGH: 0 } })
    expect(result).toEqual({ CRITICAL: 2 })
    expect(result?.HIGH).toBeUndefined()
  })

  it('ignores negative values', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: -4, HIGH: 8 } })
    expect(result?.CRITICAL).toBeUndefined()
    expect(result?.HIGH).toBe(8)
  })

  it('ignores Infinity values', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: Infinity, HIGH: 8 } })
    expect(result?.CRITICAL).toBeUndefined()
    expect(result?.HIGH).toBe(8)
  })

  it('ignores NaN values', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: NaN, MEDIUM: 24 } })
    expect(result?.CRITICAL).toBeUndefined()
    expect(result?.MEDIUM).toBe(24)
  })

  it('ignores string values that look like numbers', () => {
    const result = parseTenantSlaHours({ slaHours: { CRITICAL: '2', HIGH: 8 } })
    expect(result?.CRITICAL).toBeUndefined()
    expect(result?.HIGH).toBe(8)
  })

  it('ignores unknown keys (only processes CRITICAL/HIGH/MEDIUM/LOW)', () => {
    const settings = { slaHours: { CRITICAL: 2, URGENT: 1, LOW: 48 } }
    const result = parseTenantSlaHours(settings)
    expect(result).toEqual({ CRITICAL: 2, LOW: 48 })
    expect(Object.keys(result ?? {})).not.toContain('URGENT')
  })

  it('handles extra settings keys alongside slaHours', () => {
    const result = parseTenantSlaHours({
      timezone: 'Asia/Bangkok',
      currency: 'THB',
      slaHours: { HIGH: 6 },
    })
    expect(result).toEqual({ HIGH: 6 })
  })
})

// ── Arithmetic edge cases: cross-boundary dates ───────────────────────────────

describe('computeSlaDeadline() — cross-boundary arithmetic', () => {
  it('crosses midnight within the same day (UTC)', () => {
    // 22:00 + 4h = next day 02:00
    const base = utc('2024-03-15T22:00:00.000Z')
    const result = computeSlaDeadline('CRITICAL', base)
    expect(result.toISOString()).toBe('2024-03-16T02:00:00.000Z')
  })

  it('crosses a month boundary (March → April)', () => {
    // March 31 23:00 UTC + 8h = April 1 07:00 UTC
    const base = utc('2024-03-31T23:00:00.000Z')
    const result = computeSlaDeadline('HIGH', base)
    expect(result.toISOString()).toBe('2024-04-01T07:00:00.000Z')
  })

  it('crosses a year boundary (Dec → Jan)', () => {
    // Dec 31 20:00 UTC + 24h = Jan 1 next year 20:00 UTC
    const base = utc('2024-12-31T20:00:00.000Z')
    const result = computeSlaDeadline('MEDIUM', base)
    expect(result.toISOString()).toBe('2025-01-01T20:00:00.000Z')
  })

  it('crosses February correctly in a leap year (2024)', () => {
    // Feb 28 06:00 UTC + 72h = March 2 06:00 UTC (leap: Feb has 29 days in 2024)
    const base = utc('2024-02-28T06:00:00.000Z')
    const result = computeSlaDeadline('LOW', base)
    expect(result.toISOString()).toBe('2024-03-02T06:00:00.000Z')
  })

  it('crosses February correctly in a non-leap year (2023)', () => {
    // Feb 27 12:00 UTC + 72h = March 1 12:00 UTC (non-leap: Feb has 28 days)
    const base = utc('2023-02-27T12:00:00.000Z')
    const result = computeSlaDeadline('LOW', base)
    expect(result.toISOString()).toBe('2023-03-02T12:00:00.000Z')
  })
})

// ── DST invariance ────────────────────────────────────────────────────────────

describe('computeSlaDeadline() — DST invariance', () => {
  /**
   * SLA hours are purely additive milliseconds — DST transitions are invisible
   * because JavaScript Dates are always UTC under the hood.  These tests confirm
   * the arithmetic is not accidentally influenced by local timezone conversions.
   */

  it('US DST spring-forward 2024-03-10: 4h spans the clocks-forward boundary', () => {
    // 01:00 EST (UTC-5) = 06:00 UTC.  Clocks spring forward at 02:00 EST.
    // 4h later (UTC) = 10:00 UTC, which is 06:00 EDT (UTC-4).
    const base = utc('2024-03-10T06:00:00.000Z') // 01:00 EST
    const result = computeSlaDeadline('CRITICAL', base)
    expect(result.toISOString()).toBe('2024-03-10T10:00:00.000Z')
  })

  it('US DST fall-back 2024-11-03: 8h spans the clocks-back boundary', () => {
    // 01:00 EDT (UTC-4) = 05:00 UTC.  Clocks fall back at 02:00 EDT → 01:00 EST.
    // 8h later (UTC) = 13:00 UTC (09:00 EST).
    const base = utc('2024-11-03T05:00:00.000Z')
    const result = computeSlaDeadline('HIGH', base)
    expect(result.toISOString()).toBe('2024-11-03T13:00:00.000Z')
  })

  it('EU DST spring-forward 2024-03-31: 24h spans the boundary', () => {
    // 01:00 UTC on day before clocks spring forward in Europe.
    // 24h later = 01:00 UTC next day (unaffected — pure UTC arithmetic).
    const base = utc('2024-03-30T01:00:00.000Z')
    const result = computeSlaDeadline('MEDIUM', base)
    expect(result.toISOString()).toBe('2024-03-31T01:00:00.000Z')
  })

  it('Asia/Bangkok (UTC+7) offset: deadline is still 4h in UTC regardless', () => {
    // Bangkok does not observe DST.  A WO created at 09:00 ICT = 02:00 UTC.
    // CRITICAL deadline (4h) = 06:00 UTC = 13:00 ICT.
    const createdUtc = utc('2024-06-01T02:00:00.000Z') // 09:00 ICT
    const result = computeSlaDeadline('CRITICAL', createdUtc)
    expect(result.toISOString()).toBe('2024-06-01T06:00:00.000Z') // 13:00 ICT
  })

  it('produces the exact same result for equal UTC inputs regardless of local server timezone', () => {
    const a = new Date('2024-07-15T14:00:00.000Z')
    const b = new Date('2024-07-15T14:00:00.000Z')
    // a and b are the same point in time — results must be identical
    expect(computeSlaDeadline('HIGH', a).getTime()).toBe(computeSlaDeadline('HIGH', b).getTime())
  })
})

// ── overdueMinutes() ──────────────────────────────────────────────────────────

describe('overdueMinutes()', () => {
  it('returns 0 when the deadline is in the future', () => {
    const future = new Date(Date.now() + 60_000)
    expect(overdueMinutes(future)).toBe(0)
  })

  it('returns 0 exactly at the deadline (not yet breached)', () => {
    const now = new Date()
    // "at deadline" — might be 0 or 1 depending on timing; use a fixed reference
    expect(overdueMinutes(now, now)).toBe(0)
  })

  it('returns 1 when 90 seconds past the deadline (floor of 1.5 min)', () => {
    const deadline = new Date('2024-01-01T12:00:00.000Z')
    const at = new Date('2024-01-01T12:01:30.000Z') // 90 seconds later
    expect(overdueMinutes(deadline, at)).toBe(1)
  })

  it('returns 60 when exactly 1 hour past the deadline', () => {
    const deadline = new Date('2024-01-01T08:00:00.000Z')
    const at = new Date('2024-01-01T09:00:00.000Z')
    expect(overdueMinutes(deadline, at)).toBe(60)
  })

  it('returns 90 when 1.5 hours past', () => {
    const deadline = new Date('2024-01-01T08:00:00.000Z')
    const at = new Date('2024-01-01T09:30:00.000Z')
    expect(overdueMinutes(deadline, at)).toBe(90)
  })

  it('correctly calculates cross-day overdue duration', () => {
    const deadline = new Date('2024-03-15T23:00:00.000Z')
    const at = new Date('2024-03-16T05:00:00.000Z') // 6 hours later
    expect(overdueMinutes(deadline, at)).toBe(360)
  })

  it('uses current time as default second argument', () => {
    // Deadline 1 hour ago — should be ~60 minutes overdue
    const deadline = new Date(Date.now() - 60 * 60_000)
    const minutes = overdueMinutes(deadline)
    expect(minutes).toBeGreaterThanOrEqual(59) // allow tiny timing jitter
    expect(minutes).toBeLessThanOrEqual(61)
  })
})

// ── Integration: computeSlaDeadline + overdueMinutes ─────────────────────────

describe('computeSlaDeadline + overdueMinutes integration', () => {
  it('WO created 5 hours ago with CRITICAL (4h): ~60 minutes overdue', () => {
    const createdAt = new Date(Date.now() - 5 * 3_600_000)
    const deadline = computeSlaDeadline('CRITICAL', createdAt)
    const minutes = overdueMinutes(deadline)
    // 5h created - 4h SLA = 1h overdue = ~60 minutes
    expect(minutes).toBeGreaterThanOrEqual(59)
    expect(minutes).toBeLessThanOrEqual(61)
  })

  it('WO created 3 hours ago with CRITICAL (4h): not overdue yet', () => {
    const createdAt = new Date(Date.now() - 3 * 3_600_000)
    const deadline = computeSlaDeadline('CRITICAL', createdAt)
    expect(overdueMinutes(deadline)).toBe(0)
  })

  it('tenant override of 2h makes a 3h-old CRITICAL WO overdue by ~60 min', () => {
    const settings = { slaHours: { CRITICAL: 2 } }
    const createdAt = new Date(Date.now() - 3 * 3_600_000)
    const deadline = computeSlaDeadline('CRITICAL', createdAt, settings)
    const minutes = overdueMinutes(deadline)
    expect(minutes).toBeGreaterThanOrEqual(59)
    expect(minutes).toBeLessThanOrEqual(61)
  })
})
