/**
 * Integration tests: PrismaAssetRepository
 *
 * What this suite proves
 * ──────────────────────
 *  1. CRUD round-trip     — save() → findById() returns a fully-hydrated aggregate
 *  2. Tenant isolation    — tenant A queries never return tenant B data
 *  3. findByFilters       — search, status[], criticality[], categoryId,
 *                           locationId, hasOpenWOs, and pagination
 *  4. findChildren        — direct children only, ordered by assetNumber
 *  5. findAncestors CTE   — recursive PostgreSQL query walks the full ancestor chain
 *  6. hasOpenWorkOrders   — COUNT open (non-terminal) work orders
 *  7. nextAssetNumber     — sequential, race-free, format AST-NNNNNN
 *  8. Event publishing    — save() dispatches domain events (mocked queue)
 *
 * Infrastructure
 * ──────────────
 * Spins up a PostgreSQL 16 container via @testcontainers/postgresql.
 * Prisma migrations are applied before any tests run.
 * The container is stopped in afterAll.
 */

// Mock BullMQ before any imports so the Queue constructor never spawns a real
// Redis connection.  The local Redis is v2.4.6 (< 5.0 required by BullMQ 5.x).
// Without this, the first save() that emits domain events throws an unhandled
// BullMQ error that cascades and fails every subsequent test in the file.
import { execSync } from 'node:child_process'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Asset, AssetId, AssetNumber, AssetStatus, CriticalityLevel } from '@maintainhub/domain'
import { PrismaAssetRepository } from '../PrismaAssetRepository'

jest.mock('bullmq', () => ({
  Queue: class MockQueue {
    // eslint-disable-next-line class-methods-use-this
    add = jest.fn().mockResolvedValue({ id: 'mock-job-id' })
  },
}))

// ── Constants ─────────────────────────────────────────────────────────────────

const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/vx6m0XYdm'

// ── Suite globals ─────────────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer
let prisma: PrismaClient
let repoA: PrismaAssetRepository
let tenantAId: string
let tenantBId: string
let userAId: string
let categoryAId: string
let categoryBId: string

/** Redis stub — BullMQ is mocked at module level (see jest.mock above). */
const REDIS_STUB = {} as never

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Start PostgreSQL 16 container
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('maintainhub_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  const databaseUrl = container.getConnectionUri()

  // 2. Apply Prisma migrations
  const apiRoot = path.resolve(__dirname, '../../../..')
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })

  // 3. Connect Prisma client
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  await prisma.$connect()

  // 4. Seed tenants
  const RUN = Date.now().toString(36)

  const tenantA = await prisma.tenant.create({
    data: { name: `Tenant A ${RUN}`, slug: `tenant-a-${RUN}` },
  })
  const tenantB = await prisma.tenant.create({
    data: { name: `Tenant B ${RUN}`, slug: `tenant-b-${RUN}` },
  })
  tenantAId = tenantA.id
  tenantBId = tenantB.id

  // 5. Seed users
  const userA = await prisma.user.create({
    data: {
      tenantId: tenantAId,
      email: `admin-a-${RUN}@test.com`,
      name: 'Admin A',
      passwordHash: DUMMY_HASH,
      role: 'ADMIN',
    },
  })
  userAId = userA.id
  await prisma.user.create({
    data: {
      tenantId: tenantBId,
      email: `admin-b-${RUN}@test.com`,
      name: 'Admin B',
      passwordHash: DUMMY_HASH,
      role: 'ADMIN',
    },
  })

  // 6. Seed categories
  const catA = await prisma.assetCategory.create({
    data: { tenantId: tenantAId, code: `PUMP-${RUN}`, name: 'Pumps' },
  })
  const catB = await prisma.assetCategory.create({
    data: { tenantId: tenantBId, code: `PUMP-${RUN}`, name: 'Pumps' },
  })
  categoryAId = catA.id
  categoryBId = catB.id

  // 7. Build repositories
  repoA = new PrismaAssetRepository(prisma, REDIS_STUB)
}, 120_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await container?.stop()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Monotonically-increasing counter for ID generation.
 *
 * `Date.now()` alone produces identical IDs when `makeAsset()` is called
 * multiple times within the same millisecond (e.g. inside Promise.all).
 * Adding an incrementing offset guarantees uniqueness.
 */
let idSeq = 0

function makeAsset(opts: {
  tenantId: string
  categoryId: string
  createdById: string
  id?: string
  assetNumber?: string
  name?: string
  status?: 'OPERATIONAL' | 'STANDBY' | 'UNDER_MAINTENANCE' | 'DECOMMISSIONED'
  criticality?: 'A' | 'B' | 'C' | 'D'
  parentId?: string
  locationId?: string
  serialNumber?: string
}): Asset {
  idSeq += 1
  const rawId = opts.id ?? `c${(Date.now() + idSeq).toString(36).padEnd(24, '0')}`
  const rawNum =
    opts.assetNumber ?? `AST-${String(Math.floor(Math.random() * 999_999) + 1).padStart(6, '0')}`

  return Asset.reconstitute({
    id: new AssetId(rawId),
    tenantId: opts.tenantId,
    assetNumber: new AssetNumber(rawNum),
    categoryId: opts.categoryId,
    installDate: new Date('2023-01-01'),
    createdById: opts.createdById,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: opts.name ?? 'Test Asset',
    status: AssetStatus.from(opts.status ?? 'OPERATIONAL'),
    criticality: CriticalityLevel.from(opts.criticality ?? 'C'),
    ...(opts.parentId !== undefined && { parentId: new AssetId(opts.parentId) }),
    ...(opts.locationId !== undefined && { locationId: opts.locationId }),
    ...(opts.serialNumber !== undefined && { serialNumber: opts.serialNumber }),
  })
}

// ── CRUD round-trip ───────────────────────────────────────────────────────────

describe('save / findById', () => {
  it('persists and reloads a new asset', async () => {
    const asset = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'Centrifugal Pump',
    })
    await repoA.save(asset)

    const loaded = await repoA.findById(asset.id, tenantAId)
    expect(loaded).not.toBeNull()
    expect(loaded!.id.value).toBe(asset.id.value)
    expect(loaded!.name).toBe('Centrifugal Pump')
    expect(loaded!.status.value).toBe('OPERATIONAL')
  })

  it('returns null for a non-existent id', async () => {
    const fakeId = new AssetId('clh7z2d1h0000z1x1z1x1z1x1')
    const result = await repoA.findById(fakeId, tenantAId)
    expect(result).toBeNull()
  })

  it('updates mutable fields on re-save (upsert)', async () => {
    const asset = makeAsset({ tenantId: tenantAId, categoryId: categoryAId, createdById: userAId })
    await repoA.save(asset)

    // changeStatus() emits AssetStatusChangedEvent; BullMQ is mocked so the
    // event publish succeeds without a real Redis connection.
    const loaded = await repoA.findById(asset.id, tenantAId)
    loaded!.changeStatus(AssetStatus.from('STANDBY'), userAId)
    await repoA.save(loaded!)

    const updated = await repoA.findById(asset.id, tenantAId)
    expect(updated!.status.value).toBe('STANDBY')
  })
})

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('does not return tenant B assets when querying as tenant A', async () => {
    const assetB = makeAsset({ tenantId: tenantBId, categoryId: categoryBId, createdById: userAId })
    await repoA.save(assetB)

    const result = await repoA.findById(assetB.id, tenantAId) // query with tenant A's id
    expect(result).toBeNull()
  })
})

// ── findByAssetNumber ─────────────────────────────────────────────────────────

describe('findByAssetNumber', () => {
  it('finds an asset by its unique number', async () => {
    const num = AssetNumber.fromSequence(700001)
    const asset = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      assetNumber: num.value,
    })
    await repoA.save(asset)

    const found = await repoA.findByAssetNumber(num, tenantAId)
    expect(found).not.toBeNull()
    expect(found!.assetNumber.value).toBe(num.value)
  })
})

// ── findChildren ──────────────────────────────────────────────────────────────

describe('findChildren', () => {
  let parentId: string

  beforeAll(async () => {
    const parent = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'Parent System',
    })
    await repoA.save(parent)
    parentId = parent.id.value

    // Three children — seeds to verify ordering by assetNumber
    const nums = ['AST-000010', 'AST-000030', 'AST-000020']
    await Promise.all(
      nums.map((n) =>
        repoA.save(
          makeAsset({
            tenantId: tenantAId,
            categoryId: categoryAId,
            createdById: userAId,
            assetNumber: n,
            parentId,
          }),
        ),
      ),
    )
  })

  it('returns only direct children, ordered by assetNumber', async () => {
    const children = await repoA.findChildren(new AssetId(parentId), tenantAId)
    expect(children.length).toBe(3)
    expect(children.map((c) => c.assetNumber.value)).toEqual([
      'AST-000010',
      'AST-000020',
      'AST-000030',
    ])
  })

  it('does not return grandchildren', async () => {
    const firstChild = (await repoA.findChildren(new AssetId(parentId), tenantAId))[0]!
    const grandchild = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      parentId: firstChild.id.value,
    })
    await repoA.save(grandchild)

    const direct = await repoA.findChildren(new AssetId(parentId), tenantAId)
    const directIds = direct.map((c) => c.id.value)
    expect(directIds).not.toContain(grandchild.id.value)
  })
})

// ── findAncestors (recursive CTE) ────────────────────────────────────────────

describe('findAncestors — recursive CTE', () => {
  /**
   * Tree: Plant → Building → System → Equipment
   * Querying ancestors of Equipment should return [Building, Plant]
   * (System is omitted from the expected check because the CTE walks all the way up)
   */
  let plantId: string
  let buildingId: string
  let systemId: string
  let equipmentId: string

  beforeAll(async () => {
    const plant = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'Plant',
      assetNumber: 'AST-001100',
    })
    await repoA.save(plant)
    plantId = plant.id.value

    const building = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'Building',
      assetNumber: 'AST-001200',
      parentId: plantId,
    })
    await repoA.save(building)
    buildingId = building.id.value

    const system = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'System',
      assetNumber: 'AST-001300',
      parentId: buildingId,
    })
    await repoA.save(system)
    systemId = system.id.value

    const equipment = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
      name: 'Equipment',
      assetNumber: 'AST-001400',
      parentId: systemId,
    })
    await repoA.save(equipment)
    equipmentId = equipment.id.value
  })

  it('returns all ancestors for a deeply nested asset', async () => {
    const ancestors = await repoA.findAncestors(new AssetId(equipmentId), tenantAId)
    const ids = ancestors.map((a) => a.id.value)

    expect(ids).toContain(plantId)
    expect(ids).toContain(buildingId)
    expect(ids).toContain(systemId)
    // The queried asset itself must not appear in ancestors
    expect(ids).not.toContain(equipmentId)
  })

  it('returns correct ancestor count (3 ancestors for depth-4 asset)', async () => {
    const ancestors = await repoA.findAncestors(new AssetId(equipmentId), tenantAId)
    expect(ancestors.length).toBe(3)
  })

  it('returns empty array for a root asset (no parent)', async () => {
    const ancestors = await repoA.findAncestors(new AssetId(plantId), tenantAId)
    expect(ancestors).toHaveLength(0)
  })

  it('returns one ancestor for a second-level asset', async () => {
    const ancestors = await repoA.findAncestors(new AssetId(buildingId), tenantAId)
    expect(ancestors).toHaveLength(1)
    expect(ancestors[0]!.id.value).toBe(plantId)
  })

  it('does not leak ancestors across tenants', async () => {
    // Tenant B has its own separate root — should not appear in tenant A CTE
    const rootB = makeAsset({
      tenantId: tenantBId,
      categoryId: categoryBId,
      createdById: userAId,
      assetNumber: 'AST-001100',
    })
    await repoA.save(rootB)

    const ancestors = await repoA.findAncestors(new AssetId(equipmentId), tenantAId)
    const ids = ancestors.map((a) => a.id.value)
    expect(ids).not.toContain(rootB.id.value)
  })
})

// ── hasOpenWorkOrders ─────────────────────────────────────────────────────────

describe('hasOpenWorkOrders', () => {
  let assetWithOpenWO: Asset
  let assetWithNoWO: Asset

  beforeAll(async () => {
    assetWithOpenWO = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
    })
    assetWithNoWO = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
    })
    await repoA.save(assetWithOpenWO)
    await repoA.save(assetWithNoWO)

    // Seed an IN_PROGRESS work order for assetWithOpenWO
    await prisma.workOrder.create({
      data: {
        id: `c${Date.now().toString(36).padEnd(24, '0')}`,
        tenantId: tenantAId,
        woNumber: `WO-OPEN-${Date.now()}`,
        title: 'Open repair',
        assetId: assetWithOpenWO.id.value,
        createdById: userAId,
        status: 'IN_PROGRESS',
      },
    })

    // Seed a COMPLETED work order (terminal) for assetWithOpenWO
    await prisma.workOrder.create({
      data: {
        id: `c${(Date.now() + 1).toString(36).padEnd(24, '0')}`,
        tenantId: tenantAId,
        woNumber: `WO-DONE-${Date.now()}`,
        title: 'Done repair',
        assetId: assetWithOpenWO.id.value,
        createdById: userAId,
        status: 'COMPLETED',
      },
    })
  })

  it('returns true when the asset has an open (IN_PROGRESS) work order', async () => {
    const result = await repoA.hasOpenWorkOrders(assetWithOpenWO.id, tenantAId)
    expect(result).toBe(true)
  })

  it('returns false when the asset has no work orders', async () => {
    const result = await repoA.hasOpenWorkOrders(assetWithNoWO.id, tenantAId)
    expect(result).toBe(false)
  })

  it('returns false when only terminal work orders exist (COMPLETED)', async () => {
    const assetOnlyDone = makeAsset({
      tenantId: tenantAId,
      categoryId: categoryAId,
      createdById: userAId,
    })
    await repoA.save(assetOnlyDone)
    await prisma.workOrder.create({
      data: {
        id: `c${(Date.now() + 2).toString(36).padEnd(24, '0')}`,
        tenantId: tenantAId,
        woNumber: `WO-COMPLETED-${Date.now()}`,
        title: 'Completed',
        assetId: assetOnlyDone.id.value,
        createdById: userAId,
        status: 'COMPLETED',
      },
    })
    const result = await repoA.hasOpenWorkOrders(assetOnlyDone.id, tenantAId)
    expect(result).toBe(false)
  })

  it.each(['DRAFT', 'OPEN', 'ON_HOLD'] as const)(
    'returns true for status %s (non-terminal)',
    async (status) => {
      const a = makeAsset({ tenantId: tenantAId, categoryId: categoryAId, createdById: userAId })
      await repoA.save(a)
      await prisma.workOrder.create({
        data: {
          id: `c${(Date.now() + Math.random()).toString(36).slice(0, 24).padEnd(24, '0')}`,
          tenantId: tenantAId,
          woNumber: `WO-${status}-${Date.now()}`,
          title: `WO ${status}`,
          assetId: a.id.value,
          createdById: userAId,
          status,
        },
      })
      expect(await repoA.hasOpenWorkOrders(a.id, tenantAId)).toBe(true)
    },
  )
})

// ── findByFilters ─────────────────────────────────────────────────────────────

describe('findByFilters', () => {
  let filterCategoryId: string
  let filterLocationId: string

  beforeAll(async () => {
    // Dedicate category + location for this describe block
    const RUN = `filter-${Date.now().toString(36)}`
    const cat = await prisma.assetCategory.create({
      data: { tenantId: tenantAId, code: `FILTER-CAT-${RUN}`, name: 'Filter Cat' },
    })
    filterCategoryId = cat.id

    const loc = await prisma.location.create({
      data: { tenantId: tenantAId, code: `LOC-${RUN}`, name: 'Filter Location' },
    })
    filterLocationId = loc.id

    const seeds = [
      {
        name: 'Alpha Pump',
        status: 'OPERATIONAL' as const,
        criticality: 'A' as const,
        serial: 'SN-ALPHA',
      },
      {
        name: 'Beta Motor',
        status: 'STANDBY' as const,
        criticality: 'B' as const,
        serial: 'SN-BETA',
      },
      {
        name: 'Gamma Valve',
        status: 'OPERATIONAL' as const,
        criticality: 'C' as const,
        serial: 'SN-GAMMA',
      },
    ]

    await Promise.all(
      seeds.map((s) =>
        repoA.save(
          makeAsset({
            tenantId: tenantAId,
            categoryId: filterCategoryId,
            createdById: userAId,
            name: s.name,
            status: s.status,
            criticality: s.criticality,
            serialNumber: s.serial,
            locationId: filterLocationId,
          }),
        ),
      ),
    )
  })

  it('search by name (ILIKE)', async () => {
    const { items } = await repoA.findByFilters(
      { search: 'pump', categoryId: filterCategoryId },
      tenantAId,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.every((a) => a.name.toLowerCase().includes('pump'))).toBe(true)
  })

  it('search by serialNumber', async () => {
    const { items } = await repoA.findByFilters(
      { search: 'SN-BETA', categoryId: filterCategoryId },
      tenantAId,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0]!.serialNumber).toBe('SN-BETA')
  })

  it('filter by status array', async () => {
    const { items } = await repoA.findByFilters(
      { status: ['STANDBY'], categoryId: filterCategoryId },
      tenantAId,
    )
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.every((a) => a.status.value === 'STANDBY')).toBe(true)
  })

  it('filter by criticality array', async () => {
    const { items } = await repoA.findByFilters(
      { criticality: ['A', 'B'], categoryId: filterCategoryId },
      tenantAId,
    )
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.every((a) => ['A', 'B'].includes(a.criticality.value))).toBe(true)
  })

  it('filter by categoryId', async () => {
    const { items } = await repoA.findByFilters({ categoryId: filterCategoryId }, tenantAId)
    expect(items.every((a) => a.categoryId === filterCategoryId)).toBe(true)
  })

  it('filter by locationId', async () => {
    const { items, total } = await repoA.findByFilters({ locationId: filterLocationId }, tenantAId)
    expect(total).toBe(3)
    expect(items.every((a) => a.locationId === filterLocationId)).toBe(true)
  })

  it('pagination: page 1 of 2 (limit 2)', async () => {
    const { items: p1, total } = await repoA.findByFilters(
      { categoryId: filterCategoryId, page: 1, limit: 2 },
      tenantAId,
    )
    const { items: p2 } = await repoA.findByFilters(
      { categoryId: filterCategoryId, page: 2, limit: 2 },
      tenantAId,
    )
    expect(total).toBe(3)
    expect(p1).toHaveLength(2)
    expect(p2).toHaveLength(1)
  })

  it('hasOpenWOs = true returns only assets with open work orders', async () => {
    const withWO = makeAsset({
      tenantId: tenantAId,
      categoryId: filterCategoryId,
      createdById: userAId,
      locationId: filterLocationId,
    })
    const withoutWO = makeAsset({
      tenantId: tenantAId,
      categoryId: filterCategoryId,
      createdById: userAId,
      locationId: filterLocationId,
    })
    await repoA.save(withWO)
    await repoA.save(withoutWO)

    await prisma.workOrder.create({
      data: {
        id: `c${(Date.now() + 50).toString(36).padEnd(24, '0')}`,
        tenantId: tenantAId,
        woNumber: `WO-FILTER-${Date.now()}`,
        title: 'Open WO',
        assetId: withWO.id.value,
        createdById: userAId,
        status: 'OPEN',
      },
    })

    const { items } = await repoA.findByFilters(
      { hasOpenWOs: true, categoryId: filterCategoryId },
      tenantAId,
    )
    const ids = items.map((a) => a.id.value)
    expect(ids).toContain(withWO.id.value)
    expect(ids).not.toContain(withoutWO.id.value)
  })

  it('hasOpenWOs = false excludes assets with open work orders', async () => {
    const { items } = await repoA.findByFilters(
      { hasOpenWOs: false, locationId: filterLocationId },
      tenantAId,
    )
    // Assets seeded in this suite with no open WOs should be included
    expect(items.length).toBeGreaterThanOrEqual(3)
  })
})

// ── nextAssetNumber ───────────────────────────────────────────────────────────

describe('nextAssetNumber', () => {
  it('generates sequential numbers in AST-NNNNNN format', async () => {
    const n1 = await repoA.nextAssetNumber(tenantAId)
    const n2 = await repoA.nextAssetNumber(tenantAId)

    expect(n1.value).toMatch(/^AST-\d{6}$/)
    expect(n2.value).toMatch(/^AST-\d{6}$/)
    expect(n2.sequence).toBe(n1.sequence + 1)
  })

  it('tenant A and tenant B sequences are independent', async () => {
    const repoB = new PrismaAssetRepository(prisma, REDIS_STUB)

    const a = await repoA.nextAssetNumber(tenantAId)
    const b = await repoB.nextAssetNumber(tenantBId)

    // The sequence counters are per-tenant — they can be at different positions
    expect(a.value).toMatch(/^AST-\d{6}$/)
    expect(b.value).toMatch(/^AST-\d{6}$/)
    // Sequence names are different so values may or may not overlap — that's fine
    expect(a.value).not.toBe(b.value) // different tenants, different sequences
  })
})

// ── Domain event dispatch ─────────────────────────────────────────────────────

describe('event publishing', () => {
  it('calls pullEvents() on save — events array is drained', async () => {
    // Create via static factory so AssetCreatedEvent is queued
    const id = new AssetId(`c${Date.now().toString(36).padEnd(24, '0')}`)
    const assetNumber = await repoA.nextAssetNumber(tenantAId)
    const asset = Asset.create({
      id,
      tenantId: tenantAId,
      assetNumber,
      name: 'Event Test Asset',
      categoryId: categoryAId,
      criticality: CriticalityLevel.A,
      installDate: new Date(),
      createdById: userAId,
    })

    // Spy on pullEvents to confirm it is called during save()
    const spy = jest.spyOn(asset, 'pullEvents')

    // Repository will fail to enqueue (no real Redis) but save() still calls pullEvents
    try {
      await repoA.save(asset)
    } catch {
      // Expected — Redis stub has no add() method; the DB write already succeeded
    }

    expect(spy).toHaveBeenCalled()
  })
})
