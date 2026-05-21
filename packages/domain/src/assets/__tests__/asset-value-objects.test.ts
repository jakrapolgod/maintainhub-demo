/**
 * Unit tests for Asset value objects:
 *   AssetId, AssetNumber, CriticalityLevel, AssetStatus, AssetCategory
 */
import { DomainException } from '../../errors/domain.exception'
import { AssetId } from '../value-objects/asset-id'
import { AssetNumber } from '../value-objects/asset-number'
import { CriticalityLevel } from '../value-objects/criticality-level'
import { AssetStatus } from '../value-objects/asset-status'
import { AssetCategory } from '../value-objects/asset-category'

// ── AssetId ───────────────────────────────────────────────────────────────────

describe('AssetId', () => {
  const VALID = 'clh7z2d1h0000z1x1z1x1z1x1'

  it('accepts a valid CUID', () => {
    expect(new AssetId(VALID).value).toBe(VALID)
  })

  it('throws INVALID_ASSET_ID for empty string', () => {
    expect(() => new AssetId('')).toThrow(DomainException)
  })

  it('throws INVALID_ASSET_ID for non-CUID string', () => {
    expect(() => new AssetId('not-a-cuid')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_ID' }),
    )
  })

  it('equals returns true for same value', () => {
    expect(new AssetId(VALID).equals(new AssetId(VALID))).toBe(true)
  })

  it('equals returns false for different values', () => {
    const a = new AssetId('clh7z2d1h0000z1x1z1x1z1x1')
    const b = new AssetId('cm9pq3r2i0000ymbj1nhq1zr2')
    expect(a.equals(b)).toBe(false)
  })

  it('toString returns the value', () => {
    expect(new AssetId(VALID).toString()).toBe(VALID)
  })

  it('is frozen (immutable)', () => {
    const id = new AssetId(VALID)
    expect(Object.isFrozen(id)).toBe(true)
  })
})

// ── AssetNumber ───────────────────────────────────────────────────────────────

describe('AssetNumber', () => {
  it('accepts valid format AST-000001', () => {
    expect(new AssetNumber('AST-000001').value).toBe('AST-000001')
  })

  it('accepts max sequence AST-999999', () => {
    expect(new AssetNumber('AST-999999').value).toBe('AST-999999')
  })

  it('throws for wrong prefix', () => {
    expect(() => new AssetNumber('WO-000001')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_NUMBER' }),
    )
  })

  it('throws for wrong padding (5 digits)', () => {
    expect(() => new AssetNumber('AST-00001')).toThrow(DomainException)
  })

  it('throws for non-numeric suffix', () => {
    expect(() => new AssetNumber('AST-XXXXXX')).toThrow(DomainException)
  })

  it('fromSequence produces correct format', () => {
    expect(AssetNumber.fromSequence(1).value).toBe('AST-000001')
    expect(AssetNumber.fromSequence(42).value).toBe('AST-000042')
    expect(AssetNumber.fromSequence(999_999).value).toBe('AST-999999')
  })

  it('fromSequence throws for 0', () => {
    expect(() => AssetNumber.fromSequence(0)).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_NUMBER' }),
    )
  })

  it('fromSequence throws for negative', () => {
    expect(() => AssetNumber.fromSequence(-1)).toThrow(DomainException)
  })

  it('fromSequence throws for > 999 999', () => {
    expect(() => AssetNumber.fromSequence(1_000_000)).toThrow(DomainException)
  })

  it('fromSequence throws for fractional', () => {
    expect(() => AssetNumber.fromSequence(1.5)).toThrow(DomainException)
  })

  it('sequence getter extracts the number', () => {
    expect(new AssetNumber('AST-000042').sequence).toBe(42)
  })

  it('equals works correctly', () => {
    const a = new AssetNumber('AST-000001')
    expect(a.equals(new AssetNumber('AST-000001'))).toBe(true)
    expect(a.equals(new AssetNumber('AST-000002'))).toBe(false)
  })

  it('toString returns value', () => {
    expect(new AssetNumber('AST-000001').toString()).toBe('AST-000001')
  })
})

// ── CriticalityLevel ──────────────────────────────────────────────────────────

describe('CriticalityLevel', () => {
  it.each([
    ['A', 4],
    ['B', 3],
    ['C', 2],
    ['D', 1],
  ] as const)('riskScore() for %s is %d', (level, score) => {
    expect(CriticalityLevel.from(level).riskScore()).toBe(score)
  })

  it('A and B are high-risk, C and D are not', () => {
    expect(CriticalityLevel.A.isHighRisk()).toBe(true)
    expect(CriticalityLevel.B.isHighRisk()).toBe(true)
    expect(CriticalityLevel.C.isHighRisk()).toBe(false)
    expect(CriticalityLevel.D.isHighRisk()).toBe(false)
  })

  it('from() deserialises valid values', () => {
    expect(CriticalityLevel.from('A').value).toBe('A')
    expect(CriticalityLevel.from('D').value).toBe('D')
  })

  it('from() throws for invalid value', () => {
    expect(() => CriticalityLevel.from('E')).toThrow(
      expect.objectContaining({ code: 'INVALID_CRITICALITY' }),
    )
  })

  it('static instances are canonical singletons', () => {
    expect(CriticalityLevel.from('A')).toBe(CriticalityLevel.A)
    expect(CriticalityLevel.from('C')).toBe(CriticalityLevel.C)
  })

  it('equals works correctly', () => {
    expect(CriticalityLevel.A.equals(CriticalityLevel.A)).toBe(true)
    expect(CriticalityLevel.A.equals(CriticalityLevel.B)).toBe(false)
  })

  it('toString includes label', () => {
    expect(CriticalityLevel.A.toString()).toContain('Mission-critical')
    expect(CriticalityLevel.D.toString()).toContain('Low-impact')
  })
})

// ── AssetStatus ───────────────────────────────────────────────────────────────

describe('AssetStatus', () => {
  // ── Valid transitions ────────────────────────────────────────────────────────
  const VALID_TRANSITIONS: [string, string][] = [
    ['OPERATIONAL', 'STANDBY'],
    ['OPERATIONAL', 'UNDER_MAINTENANCE'],
    ['OPERATIONAL', 'DECOMMISSIONED'],
    ['STANDBY', 'OPERATIONAL'],
    ['STANDBY', 'UNDER_MAINTENANCE'],
    ['STANDBY', 'DECOMMISSIONED'],
    ['UNDER_MAINTENANCE', 'OPERATIONAL'],
    ['UNDER_MAINTENANCE', 'STANDBY'],
    ['UNDER_MAINTENANCE', 'DECOMMISSIONED'],
  ]

  it.each(VALID_TRANSITIONS)('%s → %s is allowed', (from, to) => {
    const f = AssetStatus.from(from)
    const t = AssetStatus.from(to)
    expect(f.canTransitionTo(t)).toBe(true)
    expect(() => f.transitionTo(t)).not.toThrow()
  })

  // ── Invalid transitions ──────────────────────────────────────────────────────
  const INVALID_TRANSITIONS: [string, string][] = [
    ['DECOMMISSIONED', 'OPERATIONAL'],
    ['DECOMMISSIONED', 'STANDBY'],
    ['DECOMMISSIONED', 'UNDER_MAINTENANCE'],
  ]

  it.each(INVALID_TRANSITIONS)('%s → %s is FORBIDDEN', (from, to) => {
    const f = AssetStatus.from(from)
    const t = AssetStatus.from(to)
    expect(f.canTransitionTo(t)).toBe(false)
    expect(() => f.transitionTo(t)).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_STATUS_TRANSITION' }),
    )
  })

  it('DECOMMISSIONED is terminal', () => {
    expect(AssetStatus.DECOMMISSIONED.isTerminal()).toBe(true)
    expect(AssetStatus.OPERATIONAL.isTerminal()).toBe(false)
  })

  it('predicates work', () => {
    expect(AssetStatus.OPERATIONAL.isOperational()).toBe(true)
    expect(AssetStatus.UNDER_MAINTENANCE.isUnderMaintenance()).toBe(true)
    expect(AssetStatus.DECOMMISSIONED.isDecommissioned()).toBe(true)
  })

  it('from() throws for invalid value', () => {
    expect(() => AssetStatus.from('BROKEN')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_STATUS' }),
    )
  })

  it('static instances are canonical singletons', () => {
    expect(AssetStatus.from('OPERATIONAL')).toBe(AssetStatus.OPERATIONAL)
  })

  it('equals works correctly', () => {
    expect(AssetStatus.OPERATIONAL.equals(AssetStatus.OPERATIONAL)).toBe(true)
    expect(AssetStatus.OPERATIONAL.equals(AssetStatus.STANDBY)).toBe(false)
  })

  it('toString returns the raw value', () => {
    expect(AssetStatus.OPERATIONAL.toString()).toBe('OPERATIONAL')
    expect(AssetStatus.DECOMMISSIONED.toString()).toBe('DECOMMISSIONED')
    expect(AssetStatus.UNDER_MAINTENANCE.toString()).toBe('UNDER_MAINTENANCE')
    expect(AssetStatus.STANDBY.toString()).toBe('STANDBY')
  })

  it('from(DECOMMISSIONED) returns the static instance', () => {
    expect(AssetStatus.from('DECOMMISSIONED')).toBe(AssetStatus.DECOMMISSIONED)
  })
})

// ── AssetCategory ─────────────────────────────────────────────────────────────

describe('AssetCategory', () => {
  it('creates with id and name', () => {
    const cat = new AssetCategory({ id: 'cat-1', name: 'Pumps' })
    expect(cat.id).toBe('cat-1')
    expect(cat.name).toBe('Pumps')
    expect(cat.parentCategoryId).toBeUndefined()
    expect(cat.isRoot()).toBe(true)
  })

  it('creates with parentCategoryId', () => {
    const cat = new AssetCategory({
      id: 'cat-2',
      name: 'Centrifugal Pumps',
      parentCategoryId: 'cat-1',
    })
    expect(cat.isRoot()).toBe(false)
    expect(cat.parentCategoryId).toBe('cat-1')
  })

  it('trims whitespace from id and name', () => {
    const cat = new AssetCategory({ id: '  cat-1  ', name: '  Pumps  ' })
    expect(cat.id).toBe('cat-1')
    expect(cat.name).toBe('Pumps')
  })

  it('treats empty parentCategoryId as undefined', () => {
    const cat = new AssetCategory({ id: 'cat-1', name: 'Pumps', parentCategoryId: '   ' })
    expect(cat.parentCategoryId).toBeUndefined()
    expect(cat.isRoot()).toBe(true)
  })

  it('throws INVALID_CATEGORY_ID for empty id', () => {
    expect(() => new AssetCategory({ id: '', name: 'Pumps' })).toThrow(
      expect.objectContaining({ code: 'INVALID_CATEGORY_ID' }),
    )
  })

  it('throws INVALID_CATEGORY_NAME for empty name', () => {
    expect(() => new AssetCategory({ id: 'cat-1', name: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_CATEGORY_NAME' }),
    )
  })

  it('equals compares by id only', () => {
    const a = new AssetCategory({ id: 'cat-1', name: 'Pumps' })
    const b = new AssetCategory({ id: 'cat-1', name: 'Different Name' })
    const c = new AssetCategory({ id: 'cat-2', name: 'Pumps' })
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it('toString returns name', () => {
    expect(new AssetCategory({ id: 'c', name: 'Rotating Equipment' }).toString()).toBe(
      'Rotating Equipment',
    )
  })
})
