/**
 * Unit tests for the Asset aggregate root.
 *
 * DoD-critical scenarios tested here:
 *   - Circular reference prevention (self-loop + ancestor chain)
 *   - Depth limit enforcement (max 5 levels)
 *   - Decommission blocked when open WOs exist
 *   - All valid and invalid status transitions
 *   - Domain event emission shapes
 *   - Warranty active/inactive logic
 *   - Document deduplication
 */
import { Asset, MAX_ASSET_DEPTH } from '../Asset'
import type { AssetDocument } from '../Asset'
import { AssetId } from '../value-objects/asset-id'
import { AssetNumber } from '../value-objects/asset-number'
import { AssetStatus } from '../value-objects/asset-status'
import { CriticalityLevel } from '../value-objects/criticality-level'
import { AssetCreatedEvent } from '../events/asset-created.event'
import { AssetStatusChangedEvent } from '../events/asset-status-changed.event'
import { AssetDecommissionedEvent } from '../events/asset-decommissioned.event'
import { AssetTransferredEvent } from '../events/asset-transferred.event'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ID_1 = new AssetId('clh7z2d1h0000z1x1z1x1z1x1')
const ID_2 = new AssetId('cm9pq3r2i0000ymbj1nhq1zr2')
const ID_3 = new AssetId('cla1b2c3d0000e1f1g1h1i1j1')
const NUM_1 = new AssetNumber('AST-000001')
const TENANT = 'tenant-abc'
const USER = 'user-admin'

function makeAsset(overrides: Partial<Parameters<typeof Asset.create>[0]> = {}): Asset {
  return Asset.create({
    id: ID_1,
    tenantId: TENANT,
    assetNumber: NUM_1,
    name: 'Pump P-101',
    categoryId: 'cat-rotating',
    criticality: CriticalityLevel.B,
    installDate: new Date('2020-01-15'),
    createdById: USER,
    ...overrides,
  })
}

function makeAssetFromProps(
  overrides: Partial<Parameters<typeof Asset.reconstitute>[0]> = {},
): Asset {
  return Asset.reconstitute({
    id: ID_1,
    tenantId: TENANT,
    assetNumber: NUM_1,
    name: 'Pump P-101',
    categoryId: 'cat-rotating',
    criticality: CriticalityLevel.B,
    installDate: new Date('2020-01-15'),
    status: AssetStatus.OPERATIONAL,
    createdById: USER,
    createdAt: new Date('2020-01-15'),
    updatedAt: new Date('2020-01-15'),
    ...overrides,
  })
}

// ── Asset.create() ────────────────────────────────────────────────────────────

describe('Asset.create()', () => {
  it('creates an asset in OPERATIONAL status', () => {
    const a = makeAsset()
    expect(a.status.value).toBe('OPERATIONAL')
  })

  it('emits AssetCreatedEvent with correct fields', () => {
    const a = makeAsset()
    const events = a.pullEvents()
    expect(events).toHaveLength(1)
    const evt = events[0] as AssetCreatedEvent
    expect(evt).toBeInstanceOf(AssetCreatedEvent)
    expect(evt.aggregateId).toBe(ID_1.value)
    expect(evt.tenantId).toBe(TENANT)
    expect(evt.assetNumber).toBe(NUM_1.value)
    expect(evt.name).toBe('Pump P-101')
    expect(evt.criticality).toBe('B')
    expect(evt.createdById).toBe(USER)
  })

  it('pulls events and clears the buffer', () => {
    const a = makeAsset()
    expect(a.pullEvents()).toHaveLength(1)
    expect(a.pullEvents()).toHaveLength(0)
  })

  it('throws INVALID_ASSET_NAME for blank name', () => {
    expect(() => makeAsset({ name: '   ' })).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_NAME' }),
    )
  })

  it('throws INVALID_CATEGORY_ID for blank categoryId', () => {
    expect(() => makeAsset({ categoryId: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_CATEGORY_ID' }),
    )
  })

  it('has no parent by default', () => {
    expect(makeAsset().parentId).toBeUndefined()
  })

  it('starts with empty customFields Map', () => {
    expect(makeAsset().customFields.size).toBe(0)
  })

  it('starts with empty documents array', () => {
    expect(makeAsset().documents).toHaveLength(0)
  })
})

// ── Asset.reconstitute() ──────────────────────────────────────────────────────

describe('Asset.reconstitute()', () => {
  it('restores aggregate state without emitting events', () => {
    const a = makeAssetFromProps({ status: AssetStatus.STANDBY })
    expect(a.status.value).toBe('STANDBY')
    expect(a.pullEvents()).toHaveLength(0)
  })
})

// ── changeStatus() ────────────────────────────────────────────────────────────

describe('changeStatus()', () => {
  it('transitions OPERATIONAL → UNDER_MAINTENANCE', () => {
    const a = makeAsset()
    a.pullEvents() // clear create event
    a.changeStatus(AssetStatus.UNDER_MAINTENANCE, USER)
    expect(a.status.value).toBe('UNDER_MAINTENANCE')
  })

  it('emits AssetStatusChangedEvent with correct before/after', () => {
    const a = makeAsset()
    a.pullEvents()
    a.changeStatus(AssetStatus.STANDBY, USER)
    const events = a.pullEvents()
    expect(events).toHaveLength(1)
    const evt = events[0] as AssetStatusChangedEvent
    expect(evt).toBeInstanceOf(AssetStatusChangedEvent)
    expect(evt.previousStatus).toBe('OPERATIONAL')
    expect(evt.newStatus).toBe('STANDBY')
    expect(evt.changedBy).toBe(USER)
  })

  it('allows all valid transitions in sequence', () => {
    const a = makeAsset()
    // OPERATIONAL → UNDER_MAINTENANCE → STANDBY → OPERATIONAL
    a.changeStatus(AssetStatus.UNDER_MAINTENANCE, USER)
    a.changeStatus(AssetStatus.STANDBY, USER)
    a.changeStatus(AssetStatus.OPERATIONAL, USER)
    expect(a.status.value).toBe('OPERATIONAL')
  })

  it('throws INVALID_ASSET_STATUS_TRANSITION for DECOMMISSIONED → OPERATIONAL', () => {
    const a = makeAssetFromProps({ status: AssetStatus.DECOMMISSIONED })
    expect(() => a.changeStatus(AssetStatus.OPERATIONAL, USER)).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_STATUS_TRANSITION' }),
    )
  })
})

// ── decommission() ────────────────────────────────────────────────────────────

describe('decommission()', () => {
  it('transitions to DECOMMISSIONED when no open WOs', () => {
    const a = makeAsset()
    a.decommission('End of service life', USER, false)
    expect(a.status.value).toBe('DECOMMISSIONED')
  })

  it('emits AssetDecommissionedEvent with reason and authorizedBy', () => {
    const a = makeAsset()
    a.pullEvents()
    a.decommission('Economically unviable to repair', USER, false)
    const events = a.pullEvents()
    expect(events).toHaveLength(1)
    const evt = events[0] as AssetDecommissionedEvent
    expect(evt).toBeInstanceOf(AssetDecommissionedEvent)
    expect(evt.reason).toBe('Economically unviable to repair')
    expect(evt.authorizedBy).toBe(USER)
  })

  it('throws OPEN_WORK_ORDERS_EXIST when hasOpenWOs = true', () => {
    const a = makeAsset()
    expect(() => a.decommission('reason', USER, true)).toThrow(
      expect.objectContaining({ code: 'OPEN_WORK_ORDERS_EXIST' }),
    )
  })

  it('throws ALREADY_DECOMMISSIONED when called twice', () => {
    const a = makeAsset()
    a.decommission('First time', USER, false)
    expect(() => a.decommission('Second time', USER, false)).toThrow(
      expect.objectContaining({ code: 'ALREADY_DECOMMISSIONED' }),
    )
  })

  it('throws DECOMMISSION_REASON_REQUIRED for blank reason', () => {
    const a = makeAsset()
    expect(() => a.decommission('   ', USER, false)).toThrow(
      expect.objectContaining({ code: 'DECOMMISSION_REASON_REQUIRED' }),
    )
  })

  it('cannot decommission via changeStatus + then decommission again', () => {
    const a = makeAssetFromProps({ status: AssetStatus.DECOMMISSIONED })
    expect(() => a.decommission('reason', USER, false)).toThrow(
      expect.objectContaining({ code: 'ALREADY_DECOMMISSIONED' }),
    )
  })
})

// ── transferLocation() ────────────────────────────────────────────────────────

describe('transferLocation()', () => {
  it('updates locationId and emits AssetTransferredEvent', () => {
    const a = makeAssetFromProps({ locationId: 'loc-old' })
    a.transferLocation('loc-new', USER)
    expect(a.locationId).toBe('loc-new')
    const events = a.pullEvents()
    expect(events).toHaveLength(1)
    const evt = events[0] as AssetTransferredEvent
    expect(evt).toBeInstanceOf(AssetTransferredEvent)
    expect(evt.previousLocationId).toBe('loc-old')
    expect(evt.newLocationId).toBe('loc-new')
  })

  it('emits event without previousLocationId when asset had no location', () => {
    const a = makeAsset()
    a.pullEvents()
    a.transferLocation('loc-new', USER)
    const evt = a.pullEvents()[0] as AssetTransferredEvent
    expect(evt.previousLocationId).toBeUndefined()
  })

  it('throws DECOMMISSIONED_ASSET when asset is decommissioned', () => {
    const a = makeAssetFromProps({ status: AssetStatus.DECOMMISSIONED })
    expect(() => a.transferLocation('loc-new', USER)).toThrow(
      expect.objectContaining({ code: 'DECOMMISSIONED_ASSET' }),
    )
  })

  it('throws INVALID_LOCATION_ID for empty location', () => {
    const a = makeAsset()
    expect(() => a.transferLocation('  ', USER)).toThrow(
      expect.objectContaining({ code: 'INVALID_LOCATION_ID' }),
    )
  })
})

// ── setParent() — circular reference prevention ───────────────────────────────

describe('setParent() — circular reference prevention', () => {
  it('throws CIRCULAR_REFERENCE when setting self as parent', () => {
    const a = makeAsset() // ID_1
    expect(() => a.setParent(ID_1, [], 1)).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_REFERENCE' }),
    )
  })

  it('throws CIRCULAR_REFERENCE when ancestor chain contains this asset', () => {
    // Asset A (ID_1) is being told to attach under Asset B (ID_2),
    // but B's ancestor list already contains A → circular.
    const a = makeAsset() // ID_1
    // ancestor chain of B includes A: [ID_2's parent, ..., ID_1]
    expect(() => a.setParent(ID_2, [ID_2.value, ID_1.value], 2)).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_REFERENCE' }),
    )
  })

  it('allows setting a valid parent (non-circular, within depth)', () => {
    const a = makeAsset()
    expect(() => a.setParent(ID_2, [ID_2.value], 1)).not.toThrow()
    expect(a.parentId?.value).toBe(ID_2.value)
  })

  it('allows clearing parent (undefined)', () => {
    const a = makeAssetFromProps({ parentId: ID_2 })
    a.setParent(undefined, [], 0)
    expect(a.parentId).toBeUndefined()
  })
})

// ── setParent() — depth limit enforcement ────────────────────────────────────

describe('setParent() — depth limit enforcement', () => {
  it(`allows depth exactly at MAX_ASSET_DEPTH (${MAX_ASSET_DEPTH})`, () => {
    // Parent is at depth 4 → child would be at depth 5 (= MAX)
    const a = makeAsset()
    expect(() => a.setParent(ID_2, [ID_2.value], MAX_ASSET_DEPTH - 1)).not.toThrow()
  })

  it(`throws MAX_ASSET_DEPTH_EXCEEDED when parent is already at depth ${MAX_ASSET_DEPTH}`, () => {
    // Parent is at depth 5 → child would be at depth 6 (> MAX)
    const a = makeAsset()
    expect(() => a.setParent(ID_2, [ID_2.value], MAX_ASSET_DEPTH)).toThrow(
      expect.objectContaining({ code: 'MAX_ASSET_DEPTH_EXCEEDED' }),
    )
  })

  it('throws MAX_ASSET_DEPTH_EXCEEDED at parent depth > MAX', () => {
    const a = makeAsset()
    expect(() => a.setParent(ID_3, [], MAX_ASSET_DEPTH + 1)).toThrow(
      expect.objectContaining({ code: 'MAX_ASSET_DEPTH_EXCEEDED' }),
    )
  })
})

// ── getDepthLevel() ───────────────────────────────────────────────────────────

describe('getDepthLevel()', () => {
  it('returns 1 for a root asset (no parentId)', () => {
    expect(makeAsset().getDepthLevel()).toBe(1)
  })

  it('returns 2 for an asset that has a parent', () => {
    const a = makeAssetFromProps({ parentId: ID_2 })
    expect(a.getDepthLevel()).toBe(2)
  })
})

// ── isWarrantyActive() ────────────────────────────────────────────────────────

describe('isWarrantyActive()', () => {
  it('returns false when no warrantyExpiry is set', () => {
    expect(makeAsset().isWarrantyActive()).toBe(false)
  })

  it('returns true when warrantyExpiry is in the future', () => {
    const future = new Date(Date.now() + 30 * 24 * 3_600_000)
    const a = makeAssetFromProps({ warrantyExpiry: future })
    expect(a.isWarrantyActive()).toBe(true)
  })

  it('returns false when warrantyExpiry is in the past', () => {
    const past = new Date(Date.now() - 24 * 3_600_000)
    const a = makeAssetFromProps({ warrantyExpiry: past })
    expect(a.isWarrantyActive()).toBe(false)
  })
})

// ── addDocument() ─────────────────────────────────────────────────────────────

describe('addDocument()', () => {
  const doc: AssetDocument = {
    id: 'doc-1',
    title: 'Operations Manual',
    storageKey: 'docs/pump-p101-manual.pdf',
    mimeType: 'application/pdf',
    fileSize: 204_800,
    uploadedById: USER,
    uploadedAt: new Date(),
  }

  it('adds a document to the collection', () => {
    const a = makeAsset()
    a.addDocument(doc)
    expect(a.documents).toHaveLength(1)
    expect(a.documents[0]).toMatchObject({ title: 'Operations Manual' })
  })

  it('does not add a duplicate storageKey', () => {
    const a = makeAsset()
    a.addDocument(doc)
    a.addDocument({ ...doc, id: 'doc-2', title: 'Duplicate' })
    expect(a.documents).toHaveLength(1)
  })

  it('allows distinct storageKeys', () => {
    const a = makeAsset()
    a.addDocument(doc)
    a.addDocument({ ...doc, id: 'doc-2', storageKey: 'docs/wiring.pdf', title: 'Wiring Diagram' })
    expect(a.documents).toHaveLength(2)
  })

  it('throws INVALID_DOCUMENT for empty storageKey', () => {
    const a = makeAsset()
    expect(() => a.addDocument({ ...doc, storageKey: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_DOCUMENT' }),
    )
  })
})

// ── Domain events — type assertions ──────────────────────────────────────────

describe('domain events — type assertions', () => {
  it('AssetCreatedEvent carries correct aggregate type', () => {
    const evt = makeAsset().pullEvents()[0] as AssetCreatedEvent
    expect(evt.aggregateType).toBe('Asset')
    expect(evt.eventType).toBe('AssetCreated')
  })

  it('AssetStatusChangedEvent carries correct aggregate type', () => {
    const a = makeAsset()
    a.pullEvents()
    a.changeStatus(AssetStatus.STANDBY, USER)
    const evt = a.pullEvents()[0] as AssetStatusChangedEvent
    expect(evt.aggregateType).toBe('Asset')
    expect(evt.eventType).toBe('AssetStatusChanged')
  })

  it('AssetDecommissionedEvent carries correct aggregate type', () => {
    const a = makeAsset()
    a.pullEvents()
    a.decommission('EOL', USER, false)
    const evt = a.pullEvents()[0] as AssetDecommissionedEvent
    expect(evt.aggregateType).toBe('Asset')
    expect(evt.eventType).toBe('AssetDecommissioned')
  })

  it('AssetTransferredEvent carries correct aggregate type', () => {
    const a = makeAsset()
    a.pullEvents()
    a.transferLocation('loc-xyz', USER)
    const evt = a.pullEvents()[0] as AssetTransferredEvent
    expect(evt.aggregateType).toBe('Asset')
    expect(evt.eventType).toBe('AssetTransferred')
  })

  it('each event has a unique eventId (UUID)', () => {
    const a = makeAsset()
    a.changeStatus(AssetStatus.STANDBY, USER)
    a.changeStatus(AssetStatus.OPERATIONAL, USER)
    const events = a.pullEvents()
    const ids = events.map((e) => (e as AssetCreatedEvent).eventId)
    expect(new Set(ids).size).toBe(events.length)
  })
})

// ── MAX_ASSET_DEPTH constant ──────────────────────────────────────────────────

describe('MAX_ASSET_DEPTH', () => {
  it('is 5', () => {
    expect(MAX_ASSET_DEPTH).toBe(5)
  })
})

// ── Accessor coverage ─────────────────────────────────────────────────────────

describe('accessors', () => {
  it('all accessors return correct values when reconstituted with full props', () => {
    const now = new Date('2023-06-01')
    const expiry = new Date('2028-06-01')
    const fields = new Map<string, unknown>([['key', 'value']])
    const a = makeAssetFromProps({
      description: 'Test desc',
      locationId: 'loc-1',
      parentId: ID_2,
      manufacturer: 'Grundfos',
      model: 'CR 5-8',
      serialNumber: 'GF-12345',
      warrantyExpiry: expiry,
      customFields: fields,
      updatedAt: now,
    })
    expect(a.criticality.value).toBe('B')
    expect(a.name).toBe('Pump P-101')
    expect(a.description).toBe('Test desc')
    expect(a.locationId).toBe('loc-1')
    expect(a.parentId?.value).toBe(ID_2.value)
    expect(a.manufacturer).toBe('Grundfos')
    expect(a.model).toBe('CR 5-8')
    expect(a.serialNumber).toBe('GF-12345')
    expect(a.warrantyExpiry).toEqual(expiry)
    expect(a.customFields.get('key')).toBe('value')
    expect(a.updatedAt).toEqual(now)
  })
})
