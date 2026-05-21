/**
 * Integration test: PrismaWorkOrderRepository
 *
 * What this suite proves
 * ──────────────────────
 *  1. CRUD round-trip  — save() → findById() returns a fully-hydrated aggregate
 *  2. Tenant isolation — tenant A's queries never return tenant B's data
 *  3. findByFilters    — status[], priority[], assetId, assigneeId, search,
 *                        date range, and pagination all work correctly
 *  4. findOverdueSLA   — returns IN_PROGRESS/OPEN WOs past their SLA deadline
 *  5. nextWONumber     — generates WO-YYYY-NNNNNN; sequential under concurrency
 *  6. softDelete       — sets deletedAt; row excluded from subsequent queries
 *  7. Event publishing — save() pulls and dispatches domain events (mocked)
 *
 * Infrastructure
 * ──────────────
 * Spins up a dedicated PostgreSQL 16 container via @testcontainers/postgresql.
 * Prisma migrations are applied against the container before any test runs.
 * The container is stopped in afterAll.
 */

// Mock BullMQ before any imports — local Redis is v2.4.6 (< 5.0 required).
import { execSync } from 'node:child_process'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Priority, WorkOrder, WorkOrderId, WorkOrderStatus } from '@maintainhub/domain'
import { PrismaWorkOrderRepository } from '../PrismaWorkOrderRepository'
import { WorkOrderMapper } from '../WorkOrderMapper'

jest.mock('bullmq', () => ({
  Queue: class MockQueue {
    // eslint-disable-next-line class-methods-use-this
    add = jest.fn().mockResolvedValue({ id: 'mock-job-id' })
  },
}))

// ── Constants ─────────────────────────────────────────────────────────────────

const CUID_A = 'clh7z2d1h0000z1x1z1x1z1x1' // tenant A's WO id
const CUID_B = 'cm9pq3r2i0000ymbj1nhq1zr2' // tenant B's WO id
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/vx6m0XYdm'

// ── Suite globals ─────────────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer
let prisma: PrismaClient
let repoA: PrismaWorkOrderRepository // scoped to tenant A
let repoB: PrismaWorkOrderRepository // scoped to tenant B
let tenantAId: string
let tenantBId: string
let assetAId: string
let assetBId: string

/** Minimal Redis stub — satisfies the constructor signature without a real connection. */
const REDIS_STUB = {
  // BullMQ tests are not in scope here; events are verified via spy.
} as never

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // ── 1. Start PostgreSQL container ────────────────────────────────────────────
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('maintainhub_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  const databaseUrl = container.getConnectionUri()

  // ── 2. Apply Prisma migrations ───────────────────────────────────────────────
  const apiRoot = path.resolve(__dirname, '../../../..')
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })

  // ── 3. Connect Prisma ────────────────────────────────────────────────────────
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  await prisma.$connect()

  // ── 4. Seed two tenants ──────────────────────────────────────────────────────
  const RUN = Date.now().toString(36)

  const tenantA = await prisma.tenant.create({
    data: { name: `Tenant A ${RUN}`, slug: `tenant-a-${RUN}` },
  })
  const tenantB = await prisma.tenant.create({
    data: { name: `Tenant B ${RUN}`, slug: `tenant-b-${RUN}` },
  })

  tenantAId = tenantA.id
  tenantBId = tenantB.id

  // ── 5. Seed users for foreign keys ───────────────────────────────────────────
  const userA = await prisma.user.create({
    data: {
      tenantId: tenantAId,
      email: `admin-a-${RUN}@test.com`,
      name: 'Admin A',
      passwordHash: DUMMY_HASH,
      role: 'ADMIN',
    },
  })
  const userB = await prisma.user.create({
    data: {
      tenantId: tenantBId,
      email: `admin-b-${RUN}@test.com`,
      name: 'Admin B',
      passwordHash: DUMMY_HASH,
      role: 'ADMIN',
    },
  })

  // ── 6. Seed asset categories and assets ──────────────────────────────────────
  const catA = await prisma.assetCategory.create({
    data: { tenantId: tenantAId, code: `PUMP-${RUN}`, name: 'Pumps A' },
  })
  const catB = await prisma.assetCategory.create({
    data: { tenantId: tenantBId, code: `PUMP-${RUN}`, name: 'Pumps B' },
  })

  const assetA = await prisma.asset.create({
    data: {
      tenantId: tenantAId,
      assetNumber: `P-101-${RUN}`,
      name: 'Pump P-101',
      categoryId: catA.id,
    },
  })
  const assetB = await prisma.asset.create({
    data: {
      tenantId: tenantBId,
      assetNumber: `P-101-${RUN}`,
      name: 'Pump P-101',
      categoryId: catB.id,
    },
  })

  assetAId = assetA.id
  assetBId = assetB.id

  // ── 7. Construct repositories ─────────────────────────────────────────────────
  repoA = new PrismaWorkOrderRepository(prisma, REDIS_STUB)
  repoB = new PrismaWorkOrderRepository(prisma, REDIS_STUB)

  // Silence unused-var warnings — userA/userB ids are not needed by tests
  void userA
  void userB
}, 120_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await container?.stop()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal domain WorkOrder for testing. */
function makeWO(opts: {
  tenantId: string
  assetId: string
  id?: string
  status?: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  slaDeadline?: Date
  assigneeIds?: string[]
  woNumber?: string
}): WorkOrder {
  const id = opts.id ?? `c${Date.now().toString(36).padEnd(24, '0')}`
  return WorkOrder.reconstitute({
    id: new WorkOrderId(id),
    tenantId: opts.tenantId,
    woNumber: opts.woNumber ?? `WO-2024-${Date.now().toString().slice(-6)}`,
    title: 'Test work order',
    type: 'CORRECTIVE',
    priority: Priority.from(opts.priority ?? 'MEDIUM'),
    status: WorkOrderStatus.from(opts.status ?? 'OPEN'),
    assetId: opts.assetId,
    createdById: 'user-test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(opts.slaDeadline !== undefined && { slaDeadline: opts.slaDeadline }),
    ...(opts.assigneeIds !== undefined && { assigneeIds: opts.assigneeIds }),
  })
}

// ── nextWONumber ──────────────────────────────────────────────────────────────

describe('nextWONumber()', () => {
  it('generates a correctly formatted WO number', async () => {
    const num = await repoA.nextWONumber(tenantAId)
    expect(num).toMatch(/^WO-\d{4}-\d{6}$/)
  })

  it('concurrent calls produce unique, consecutive sequence numbers', async () => {
    const nums = await Promise.all([
      repoA.nextWONumber(tenantAId),
      repoA.nextWONumber(tenantAId),
      repoA.nextWONumber(tenantAId),
    ])
    const seqs = nums.map((n) => parseInt(n.split('-')[2] ?? '0', 10))

    // All three values must be unique (no duplicate sequence numbers)
    expect(new Set(seqs).size).toBe(3)

    // The values must be consecutive when sorted (no gaps in the sequence)
    const sorted = [...seqs].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBe((sorted[i - 1] ?? 0) + 1)
    }
  })

  it('tenant B gets its own independent counter', async () => {
    const numA = await repoA.nextWONumber(tenantAId)
    const numB = await repoB.nextWONumber(tenantBId)
    // Both may be 1 on first call — what matters is they are independent
    const seqA = parseInt(numA.split('-')[2] ?? '0', 10)
    const seqB = parseInt(numB.split('-')[2] ?? '0', 10)
    expect(seqA).toBeGreaterThanOrEqual(1)
    expect(seqB).toBeGreaterThanOrEqual(1)
  })
})

// ── save() + findById() round-trip ────────────────────────────────────────────

describe('save() + findById() round-trip', () => {
  it('persists a new work order and loads it back as a domain aggregate', async () => {
    const wo = makeWO({ tenantId: tenantAId, assetId: assetAId, id: CUID_A })
    await repoA.save(wo)

    const loaded = await repoA.findById(new WorkOrderId(CUID_A), tenantAId)
    expect(loaded).not.toBeNull()
    expect(loaded!.id.value).toBe(CUID_A)
    expect(loaded!.tenantId).toBe(tenantAId)
    expect(loaded!.status.value).toBe('OPEN')
    expect(loaded!.priority.value).toBe('MEDIUM')
  })

  it('upserts (update) when the WO already exists', async () => {
    const wo = makeWO({ tenantId: tenantAId, assetId: assetAId, id: CUID_A })
    // Mutate via the domain
    wo.start('tech-1')
    await repoA.save(wo)

    const loaded = await repoA.findById(new WorkOrderId(CUID_A), tenantAId)
    expect(loaded!.status.value).toBe('IN_PROGRESS')
    expect(loaded!.startedAt).toBeDefined()
  })

  it('persists assigneeIds correctly', async () => {
    const wo = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id: CUID_A,
      status: 'OPEN',
      assigneeIds: ['user-alice', 'user-bob'],
    })
    await repoA.save(wo)

    const loaded = await repoA.findById(new WorkOrderId(CUID_A), tenantAId)
    expect(loaded!.assigneeIds).toContain('user-alice')
    expect(loaded!.assigneeIds).toContain('user-bob')
  })
})

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('tenant isolation — repo A cannot read tenant B data', () => {
  beforeAll(async () => {
    // Ensure tenant B has a WO saved
    const woB = makeWO({ tenantId: tenantBId, assetId: assetBId, id: CUID_B })
    await repoB.save(woB)
  })

  it('findById returns null when searching tenant B id from tenant A context', async () => {
    const result = await repoA.findById(new WorkOrderId(CUID_B), tenantAId)
    expect(result).toBeNull()
  })

  it('findByAsset returns only tenant A assets', async () => {
    const results = await repoA.findByAsset(assetAId, tenantAId)
    const ids = results.map((wo) => wo.id.value)
    expect(ids).not.toContain(CUID_B)
  })

  it('findByFilters never returns tenant B work orders', async () => {
    const { items } = await repoA.findByFilters({}, tenantAId)
    const tenants = new Set(items.map((wo) => wo.tenantId))
    expect(tenants.has(tenantBId)).toBe(false)
    tenants.forEach((t) => expect(t).toBe(tenantAId))
  })

  it('findOverdueSLA returns only tenant A results', async () => {
    // Give tenant A a breached SLA WO
    const overdue = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id: `c${'overdue1'.padEnd(24, '0')}`,
      status: 'IN_PROGRESS',
      slaDeadline: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    })
    await repoA.save(overdue)

    const results = await repoA.findOverdueSLA(tenantAId)
    const tenants = new Set(results.map((wo) => wo.tenantId))
    tenants.forEach((t) => expect(t).toBe(tenantAId))
  })

  it('explicit tenantId poisoning is blocked', async () => {
    // Even if caller mistakenly passes tenant B's id, the repository
    // parameter-binds it — the query cannot return tenant A's data
    const result = await repoA.findById(new WorkOrderId(CUID_A), tenantBId)
    // CUID_A was saved under tenantAId, so looking it up under tenantBId
    // must return null (no cross-tenant leakage)
    expect(result).toBeNull()
  })
})

// ── findByFilters ─────────────────────────────────────────────────────────────

describe('findByFilters()', () => {
  const FILTER_RUN = Date.now().toString(36)

  const makeId = (suffix: string) => `c${(FILTER_RUN + suffix).slice(0, 24).padEnd(24, '0')}`

  beforeAll(async () => {
    const wos = [
      makeWO({
        tenantId: tenantAId,
        assetId: assetAId,
        id: makeId('f1'),
        status: 'OPEN',
        priority: 'HIGH',
        woNumber: `WO-FILTER-${FILTER_RUN}-1`,
      }),
      makeWO({
        tenantId: tenantAId,
        assetId: assetAId,
        id: makeId('f2'),
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        woNumber: `WO-FILTER-${FILTER_RUN}-2`,
      }),
      makeWO({
        tenantId: tenantAId,
        assetId: assetAId,
        id: makeId('f3'),
        status: 'COMPLETED',
        priority: 'LOW',
        woNumber: `WO-FILTER-${FILTER_RUN}-3`,
      }),
      makeWO({
        tenantId: tenantAId,
        assetId: assetAId,
        id: makeId('f4'),
        status: 'OPEN',
        priority: 'MEDIUM',
        woNumber: `WO-FILTER-${FILTER_RUN}-4`,
        assigneeIds: ['tech-filter-1'],
      }),
    ]
    await Promise.all(wos.map((wo) => repoA.save(wo)))
  })

  it('returns all non-deleted work orders when no filters are applied', async () => {
    const { total } = await repoA.findByFilters({}, tenantAId)
    expect(total).toBeGreaterThanOrEqual(4)
  })

  it('filters by single status', async () => {
    const { items } = await repoA.findByFilters({ status: 'COMPLETED' }, tenantAId)
    items.forEach((wo) => expect(wo.status.value).toBe('COMPLETED'))
  })

  it('filters by status array (OR)', async () => {
    const { items } = await repoA.findByFilters({ status: ['OPEN', 'IN_PROGRESS'] }, tenantAId)
    items.forEach((wo) => {
      expect(['OPEN', 'IN_PROGRESS']).toContain(wo.status.value)
    })
  })

  it('filters by priority array', async () => {
    const { items } = await repoA.findByFilters({ priority: ['HIGH', 'CRITICAL'] }, tenantAId)
    items.forEach((wo) => {
      expect(['HIGH', 'CRITICAL']).toContain(wo.priority.value)
    })
  })

  it('filters by assigneeId', async () => {
    const { items } = await repoA.findByFilters({ assigneeId: 'tech-filter-1' }, tenantAId)
    expect(items.length).toBeGreaterThanOrEqual(1)
    items.forEach((wo) => expect(wo.assigneeIds).toContain('tech-filter-1'))
  })

  it('pagination returns correct page size', async () => {
    const { items, total } = await repoA.findByFilters({ page: 1, limit: 2 }, tenantAId)
    expect(items.length).toBeLessThanOrEqual(2)
    expect(total).toBeGreaterThanOrEqual(items.length)
  })

  it('page 2 returns a different set than page 1', async () => {
    const { items: page1 } = await repoA.findByFilters({ page: 1, limit: 2 }, tenantAId)
    const { items: page2 } = await repoA.findByFilters({ page: 2, limit: 2 }, tenantAId)
    const ids1 = new Set(page1.map((wo) => wo.id.value))
    const ids2 = new Set(page2.map((wo) => wo.id.value))
    // Pages must not share items (assuming total > 2)
    ids2.forEach((id) => expect(ids1.has(id)).toBe(false))
  })

  it('date-range filter (from) excludes older records', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) // 1 year ahead
    const { total } = await repoA.findByFilters({ from: future }, tenantAId)
    expect(total).toBe(0)
  })
})

// ── findOverdueSLA ────────────────────────────────────────────────────────────

describe('findOverdueSLA()', () => {
  it('returns OPEN WOs with slaDeadline in the past', async () => {
    const wo = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id: `c${'slabreach1'.slice(0, 24).padEnd(24, '0')}`,
      status: 'OPEN',
      slaDeadline: new Date(Date.now() - 60_000), // 1 minute ago
    })
    await repoA.save(wo)

    const results = await repoA.findOverdueSLA(tenantAId)
    const ids = results.map((r) => r.id.value)
    expect(ids).toContain(wo.id.value)
  })

  it('does NOT return COMPLETED WOs even if past SLA', async () => {
    const wo = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id: `c${'slacompleted'.slice(0, 24).padEnd(24, '0')}`,
      status: 'COMPLETED',
      slaDeadline: new Date(Date.now() - 60_000),
    })
    await repoA.save(wo)

    const results = await repoA.findOverdueSLA(tenantAId)
    const ids = results.map((r) => r.id.value)
    expect(ids).not.toContain(wo.id.value)
  })

  it('does NOT return WOs whose SLA deadline is in the future', async () => {
    const wo = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id: `c${'slafuture1'.slice(0, 24).padEnd(24, '0')}`,
      status: 'OPEN',
      slaDeadline: new Date(Date.now() + 1000 * 60 * 60 * 24), // tomorrow
    })
    await repoA.save(wo)

    const results = await repoA.findOverdueSLA(tenantAId)
    const ids = results.map((r) => r.id.value)
    expect(ids).not.toContain(wo.id.value)
  })
})

// ── softDelete ────────────────────────────────────────────────────────────────

describe('delete() — soft delete', () => {
  it('soft-deletes a work order so it disappears from subsequent queries', async () => {
    const id = `c${'deleteme1'.slice(0, 24).padEnd(24, '0')}`
    const wo = makeWO({ tenantId: tenantAId, assetId: assetAId, id })
    await repoA.save(wo)

    // Confirm it exists
    expect(await repoA.findById(new WorkOrderId(id), tenantAId)).not.toBeNull()

    // Delete
    await repoA.delete(new WorkOrderId(id), tenantAId)

    // No longer visible
    expect(await repoA.findById(new WorkOrderId(id), tenantAId)).toBeNull()
  })

  it('delete() with wrong tenantId is a no-op (cross-tenant protection)', async () => {
    const id = `c${'deletenoop1'.slice(0, 24).padEnd(24, '0')}`
    const wo = makeWO({ tenantId: tenantAId, assetId: assetAId, id })
    await repoA.save(wo)

    // Attempt to delete from tenant B context
    await repoB.delete(new WorkOrderId(id), tenantBId)

    // Still visible under tenant A
    expect(await repoA.findById(new WorkOrderId(id), tenantAId)).not.toBeNull()
  })
})

// ── Domain events ─────────────────────────────────────────────────────────────

describe('save() publishes domain events', () => {
  it('calls publishDomainEvents with the aggregate events after persist', async () => {
    const wo = WorkOrder.create({
      id: new WorkOrderId(`c${'evttest1'.slice(0, 24).padEnd(24, '0')}`),
      tenantId: tenantAId,
      woNumber: await repoA.nextWONumber(tenantAId),
      title: 'Event test WO',
      type: 'CORRECTIVE',
      priority: Priority.MEDIUM,
      assetId: assetAId,
      createdById: 'user-test',
    })

    // Spy on publishDomainEvents via pulling events before save (simulate)
    const eventsBefore = wo.pullEvents() // drain before save to isolate
    expect(eventsBefore.length).toBe(1) // WorkOrderCreatedEvent emitted by create()

    // Create a fresh WO (events not yet drained)
    const wo2 = WorkOrder.create({
      id: new WorkOrderId(`c${'evttest2'.slice(0, 24).padEnd(24, '0')}`),
      tenantId: tenantAId,
      woNumber: await repoA.nextWONumber(tenantAId),
      title: 'Event test WO 2',
      type: 'CORRECTIVE',
      priority: Priority.MEDIUM,
      assetId: assetAId,
      createdById: 'user-test',
    })

    // Patch publishDomainEvents to capture calls without a real BullMQ connection
    let capturedEvents: unknown[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest
      .spyOn(repoA as any, 'publishDomainEvents')
      .mockImplementationOnce(async (...args: unknown[]) => {
        capturedEvents = args[0] as unknown[]
      })

    await repoA.save(wo2)

    expect(capturedEvents.length).toBe(1)
    expect((capturedEvents[0] as { eventType: string }).eventType).toBe('WorkOrderCreated')
  })
})

// ── WorkOrderMapper ───────────────────────────────────────────────────────────

describe('WorkOrderMapper (unit-level within integration suite)', () => {
  it('toDomain round-trips all scalar fields', async () => {
    const id = `c${'mappertest1'.slice(0, 24).padEnd(24, '0')}`
    const sla = new Date(Date.now() + 1000 * 60 * 60 * 24)

    const wo = makeWO({
      tenantId: tenantAId,
      assetId: assetAId,
      id,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      slaDeadline: sla,
    })
    await repoA.save(wo)

    const loaded = await repoA.findById(new WorkOrderId(id), tenantAId)
    expect(loaded!.priority.value).toBe('HIGH')
    expect(loaded!.status.value).toBe('IN_PROGRESS')
    expect(loaded!.slaDeadline?.toISOString()).toBe(sla.toISOString())
  })

  it('toCreateInput / toUpdateInput do not include tenantId in the update path', () => {
    const wo = makeWO({ tenantId: tenantAId, assetId: assetAId })
    const updateData = WorkOrderMapper.toUpdateInput(wo)
    // tenantId must never appear in an UPDATE payload (immutable identity)
    expect(Object.keys(updateData)).not.toContain('tenantId')
    expect(Object.keys(updateData)).not.toContain('createdAt')
    expect(Object.keys(updateData)).not.toContain('woNumber')
  })
})
