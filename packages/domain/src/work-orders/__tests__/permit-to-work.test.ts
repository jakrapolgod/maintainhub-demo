import { DomainException } from '../../errors/domain.exception'
import { PermitToWork } from '../value-objects/permit-to-work'

// ── issue() ───────────────────────────────────────────────────────────────────

describe('PermitToWork.issue()', () => {
  it('creates an unsigned PTW with the given permit number', () => {
    const ptw = PermitToWork.issue('PTW-001')
    expect(ptw.permitNumber).toBe('PTW-001')
    expect(ptw.isSigned()).toBe(false)
    expect(ptw.signedAt).toBeUndefined()
    expect(ptw.signedBy).toBeUndefined()
  })

  it('sets issuedAt to the current time', () => {
    const before = Date.now()
    const ptw = PermitToWork.issue('PTW-002')
    expect(ptw.issuedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('trims whitespace from permitNumber', () => {
    const ptw = PermitToWork.issue('  PTW-003  ')
    expect(ptw.permitNumber).toBe('PTW-003')
  })

  it('throws INVALID_PERMIT_NUMBER for empty string', () => {
    expect(() => PermitToWork.issue('')).toThrow(
      expect.objectContaining({ code: 'INVALID_PERMIT_NUMBER' }),
    )
  })

  it('throws INVALID_PERMIT_NUMBER for whitespace-only string', () => {
    expect(() => PermitToWork.issue('   ')).toThrow(
      expect.objectContaining({ code: 'INVALID_PERMIT_NUMBER' }),
    )
  })

  it('throws DomainException for empty permit number', () => {
    expect(() => PermitToWork.issue('')).toThrow(DomainException)
  })

  it('returns a frozen (immutable) instance', () => {
    const ptw = PermitToWork.issue('PTW-001')
    expect(Object.isFrozen(ptw)).toBe(true)
  })
})

// ── reconstitute() ────────────────────────────────────────────────────────────

describe('PermitToWork.reconstitute()', () => {
  it('restores an unsigned PTW', () => {
    const issuedAt = new Date('2024-01-01')
    const ptw = PermitToWork.reconstitute({ permitNumber: 'PTW-A', issuedAt })
    expect(ptw.permitNumber).toBe('PTW-A')
    expect(ptw.issuedAt).toEqual(issuedAt)
    expect(ptw.isSigned()).toBe(false)
  })

  it('restores a signed PTW', () => {
    const issuedAt = new Date('2024-01-01')
    const signedAt = new Date('2024-01-02')
    const ptw = PermitToWork.reconstitute({
      permitNumber: 'PTW-B',
      issuedAt,
      signedAt,
      signedBy: 'safety-officer',
    })
    expect(ptw.isSigned()).toBe(true)
    expect(ptw.signedAt).toEqual(signedAt)
    expect(ptw.signedBy).toBe('safety-officer')
  })

  it('does not throw for empty permit number (bypass for DB restore)', () => {
    expect(() =>
      PermitToWork.reconstitute({ permitNumber: '', issuedAt: new Date() }),
    ).not.toThrow()
  })
})

// ── isSigned() ────────────────────────────────────────────────────────────────

describe('isSigned()', () => {
  it('returns false for an unsigned PTW', () => {
    expect(PermitToWork.issue('PTW-001').isSigned()).toBe(false)
  })

  it('returns true after signing', () => {
    expect(PermitToWork.issue('PTW-001').sign('officer-1').isSigned()).toBe(true)
  })

  it('returns true when reconstituted with both signedAt and signedBy', () => {
    const ptw = PermitToWork.reconstitute({
      permitNumber: 'PTW-X',
      issuedAt: new Date(),
      signedAt: new Date(),
      signedBy: 'officer',
    })
    expect(ptw.isSigned()).toBe(true)
  })
})

// ── sign() ────────────────────────────────────────────────────────────────────

describe('sign()', () => {
  it('returns a new signed PTW — does not mutate the original', () => {
    const original = PermitToWork.issue('PTW-001')
    const signed = original.sign('officer-1')
    expect(original.isSigned()).toBe(false) // original unchanged
    expect(signed.isSigned()).toBe(true)
  })

  it('preserves permitNumber and issuedAt on the signed copy', () => {
    const original = PermitToWork.issue('PTW-001')
    const signed = original.sign('officer-1')
    expect(signed.permitNumber).toBe('PTW-001')
    expect(signed.issuedAt).toEqual(original.issuedAt)
  })

  it('sets signedBy to the provided identifier', () => {
    const signed = PermitToWork.issue('PTW-001').sign('safety-mgr')
    expect(signed.signedBy).toBe('safety-mgr')
  })

  it('trims whitespace from the signer identifier', () => {
    const signed = PermitToWork.issue('PTW-001').sign('  safety-mgr  ')
    expect(signed.signedBy).toBe('safety-mgr')
  })

  it('sets signedAt to a recent timestamp', () => {
    const before = Date.now()
    const signed = PermitToWork.issue('PTW-001').sign('officer-1')
    expect(signed.signedAt?.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('throws INVALID_SIGNER for an empty signer identifier', () => {
    expect(() => PermitToWork.issue('PTW-001').sign('')).toThrow(
      expect.objectContaining({ code: 'INVALID_SIGNER' }),
    )
  })

  it('throws INVALID_SIGNER for a whitespace-only identifier', () => {
    expect(() => PermitToWork.issue('PTW-001').sign('   ')).toThrow(
      expect.objectContaining({ code: 'INVALID_SIGNER' }),
    )
  })

  it('throws PTW_ALREADY_SIGNED when signing a PTW that is already signed', () => {
    const signed = PermitToWork.issue('PTW-001').sign('officer-1')
    expect(() => signed.sign('officer-2')).toThrow(
      expect.objectContaining({ code: 'PTW_ALREADY_SIGNED' }),
    )
  })

  it('returns a frozen (immutable) signed instance', () => {
    const signed = PermitToWork.issue('PTW-001').sign('officer')
    expect(Object.isFrozen(signed)).toBe(true)
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('equals()', () => {
  it('returns true for two unsigned PTWs with the same number and issuedAt', () => {
    const at = new Date('2024-01-01')
    const a = PermitToWork.reconstitute({ permitNumber: 'PTW-001', issuedAt: at })
    const b = PermitToWork.reconstitute({ permitNumber: 'PTW-001', issuedAt: at })
    expect(a.equals(b)).toBe(true)
  })

  it('returns false when permit numbers differ', () => {
    const at = new Date('2024-01-01')
    const a = PermitToWork.reconstitute({ permitNumber: 'PTW-001', issuedAt: at })
    const b = PermitToWork.reconstitute({ permitNumber: 'PTW-002', issuedAt: at })
    expect(a.equals(b)).toBe(false)
  })

  it('returns false when issuedAt differs', () => {
    const a = PermitToWork.reconstitute({
      permitNumber: 'PTW-001',
      issuedAt: new Date('2024-01-01'),
    })
    const b = PermitToWork.reconstitute({
      permitNumber: 'PTW-001',
      issuedAt: new Date('2024-01-02'),
    })
    expect(a.equals(b)).toBe(false)
  })

  it('returns false when one is signed and the other is not', () => {
    const unsigned = PermitToWork.issue('PTW-001')
    const signed = unsigned.sign('officer')
    expect(unsigned.equals(signed)).toBe(false)
  })

  it('returns true for two signed PTWs with identical data (exercises both signedAt branches)', () => {
    const at = new Date('2024-01-01')
    const signed = new Date('2024-01-02')
    const a = PermitToWork.reconstitute({
      permitNumber: 'PTW-001',
      issuedAt: at,
      signedAt: signed,
      signedBy: 'officer',
    })
    const b = PermitToWork.reconstitute({
      permitNumber: 'PTW-001',
      issuedAt: at,
      signedAt: signed,
      signedBy: 'officer',
    })
    expect(a.equals(b)).toBe(true)
  })

  it('is symmetric', () => {
    const at = new Date('2024-01-01')
    const a = PermitToWork.reconstitute({ permitNumber: 'PTW-001', issuedAt: at })
    const b = PermitToWork.reconstitute({ permitNumber: 'PTW-001', issuedAt: at })
    expect(a.equals(b)).toBe(b.equals(a))
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('toString()', () => {
  it('describes an unsigned PTW', () => {
    const str = PermitToWork.issue('PTW-001').toString()
    expect(str).toContain('PTW-001')
    expect(str).toContain('unsigned')
  })

  it('describes a signed PTW with the signer name', () => {
    const str = PermitToWork.issue('PTW-001').sign('safety-officer').toString()
    expect(str).toContain('PTW-001')
    expect(str).toContain('safety-officer')
  })
})
