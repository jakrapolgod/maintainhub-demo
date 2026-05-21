/**
 * Integration test: withTenantFilter cross-tenant isolation guarantee.
 *
 * What this proves
 * ────────────────
 * A TenantClient scoped to tenant A CANNOT return, modify, or delete data
 * belonging to tenant B under ANY of the following query patterns:
 *
 *   1. findMany        — full-table scan returns only own-tenant rows
 *   2. findFirst       — cross-tenant ID lookup returns null
 *   3. findFirst       — explicit where: { tenantId: B } is overwritten → null
 *   4. count           — aggregation counts only own-tenant rows
 *   5. create          — tenantId supplied by caller is preserved (idempotent)
 *   6. create          — explicit data.tenantId: B is overwritten with A
 *   7. update          — WHERE is scoped; cross-tenant record is NOT modified
 *   8. delete          — WHERE is scoped; cross-tenant record is NOT deleted
 *   9. non-tenant model — FailureCode (no tenantId) passes through unmodified
 *
 * Infrastructure
 * ──────────────
 * Connects to the running development PostgreSQL (POSTGRES_PORT=5433 by default,
 * configured in apps/api/.env). Uses timestamp-scoped tenant slugs so test
 * records never collide with seed data. All test records are deleted in afterAll.
 *
 * Prerequisites
 * ─────────────
 *  • pnpm dev:infra must be running (docker compose up -d)
 *  • apps/api/.env must exist with DATABASE_URL pointing to the dev DB
 *  • Run via: pnpm --filter @maintainhub/api test:integration
 */

import { config as dotenvLoad } from 'dotenv'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { withTenantFilter } from '../tenant-prisma'

// ── Environment ───────────────────────────────────────────────────────────────

// Load apps/api/.env — required for DATABASE_URL
const API_ROOT = path.resolve(__dirname, '../../..')
dotenvLoad({ path: path.join(API_ROOT, '.env'), override: false })
dotenvLoad({ path: path.join(API_ROOT, '../../.env'), override: false })

// ── Test globals ──────────────────────────────────────────────────────────────

let prisma: PrismaClient

// Unique suffix isolates every test run from other data in the shared DB
const RUN_ID = Date.now().toString(36)

let tenantAId: string
let tenantBId: string
let userAId: string
let userBId: string

// Structurally valid bcrypt hash — not a real password
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/vx6m0XYdm'

// ── Suite lifecycle ───────────────────────────────────────────────────────────

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set.\nEnsure apps/api/.env exists and pnpm dev:infra is running.`,
    )
  }

  prisma = new PrismaClient({ datasourceUrl: url })
  await prisma.$connect()

  // Two tenants with timestamp-based slugs to avoid collisions with seed data
  const [tenantA, tenantB] = await Promise.all([
    prisma.tenant.create({ data: { name: `Alpha-${RUN_ID}`, slug: `alpha-${RUN_ID}` } }),
    prisma.tenant.create({ data: { name: `Beta-${RUN_ID}`, slug: `beta-${RUN_ID}` } }),
  ])
  tenantAId = tenantA.id
  tenantBId = tenantB.id

  const [userA, userB] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `alpha-${RUN_ID}@test.local`,
        name: 'Alpha Admin',
        passwordHash: DUMMY_HASH,
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `beta-${RUN_ID}@test.local`,
        name: 'Beta Admin',
        passwordHash: DUMMY_HASH,
        role: 'ADMIN',
      },
    }),
  ])
  userAId = userA.id
  userBId = userB.id

  // Asset category and asset — proves isolation across multiple model types
  const [catA, catB] = await Promise.all([
    prisma.assetCategory.create({
      data: { tenantId: tenantAId, code: `PA-${RUN_ID}`, name: 'Pump Alpha' },
    }),
    prisma.assetCategory.create({
      data: { tenantId: tenantBId, code: `PB-${RUN_ID}`, name: 'Pump Beta' },
    }),
  ])

  await Promise.all([
    prisma.asset.create({
      data: {
        tenantId: tenantAId,
        assetNumber: `A-${RUN_ID}`,
        name: 'Alpha Pump',
        categoryId: catA.id,
        criticality: 'A',
      },
    }),
    prisma.asset.create({
      data: {
        tenantId: tenantBId,
        assetNumber: `B-${RUN_ID}`,
        name: 'Beta Pump',
        categoryId: catB.id,
        criticality: 'A',
      },
    }),
  ])

  // Global failure code (no tenantId) — must pass through unfiltered
  await prisma.failureCode.upsert({
    where: { code: `INTEG-${RUN_ID}` },
    create: { code: `INTEG-${RUN_ID}`, name: 'Integration Test Code', category: 'Mechanical' },
    update: {},
  })
}, 30_000)

afterAll(async () => {
  if (!prisma) return
  // Guard: if beforeAll failed early, IDs may still be undefined
  const tenantIds = [tenantAId, tenantBId].filter((id): id is string => Boolean(id))
  if (tenantIds.length > 0) {
    // Delete in FK-safe order — children before parents
    await prisma.asset.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await prisma.assetCategory.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  }
  await prisma.failureCode.deleteMany({ where: { code: `INTEG-${RUN_ID}` } })
  await prisma.$disconnect()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const dbA = () => withTenantFilter(prisma, tenantAId)
const dbB = () => withTenantFilter(prisma, tenantBId)

// ── Scenario 1: findMany returns only own-tenant rows ─────────────────────────

describe('Scenario 1 — findMany returns only own-tenant rows', () => {
  it('tenant A client returns only tenant A users', async () => {
    const users = await dbA().user.findMany()
    expect(users.length).toBeGreaterThan(0)
    expect(users.every((u) => u.tenantId === tenantAId)).toBe(true)
    expect(users.some((u) => u.tenantId === tenantBId)).toBe(false)
  })

  it('tenant B client returns only tenant B users', async () => {
    const users = await dbB().user.findMany()
    expect(users.length).toBeGreaterThan(0)
    expect(users.every((u) => u.tenantId === tenantBId)).toBe(true)
    expect(users.some((u) => u.tenantId === tenantAId)).toBe(false)
  })

  it('the two result sets are disjoint — no shared IDs', async () => {
    const [usersA, usersB] = await Promise.all([
      dbA().user.findMany({ select: { id: true } }),
      dbB().user.findMany({ select: { id: true } }),
    ])
    const idsA = new Set(usersA.map((u) => u.id))
    const idsB = new Set(usersB.map((u) => u.id))
    expect([...idsA].filter((id) => idsB.has(id))).toHaveLength(0)
  })

  it('isolation holds across multiple tenant-scoped model types (Asset)', async () => {
    const [assetsA, assetsB] = await Promise.all([
      dbA().asset.findMany({ where: { assetNumber: { startsWith: `A-${RUN_ID}` } } }),
      dbB().asset.findMany({ where: { assetNumber: { startsWith: `B-${RUN_ID}` } } }),
    ])
    expect(assetsA.every((a) => a.tenantId === tenantAId)).toBe(true)
    expect(assetsB.every((a) => a.tenantId === tenantBId)).toBe(true)
    const idsA = assetsA.map((a) => a.id)
    const idsB = assetsB.map((a) => a.id)
    expect(idsA.some((id) => idsB.includes(id))).toBe(false)
  })
})

// ── Scenario 2: findFirst with cross-tenant ID returns null ──────────────────

describe('Scenario 2 — findFirst cross-tenant ID lookup returns null', () => {
  it('tenant A client cannot find tenant B user by primary key', async () => {
    const result = await dbA().user.findFirst({ where: { id: userBId } })
    expect(result).toBeNull()
  })

  it('tenant B client cannot find tenant A user by primary key', async () => {
    const result = await dbB().user.findFirst({ where: { id: userAId } })
    expect(result).toBeNull()
  })

  it('same client finds its own user by primary key correctly (sanity check)', async () => {
    const result = await dbA().user.findFirst({ where: { id: userAId } })
    expect(result?.id).toBe(userAId)
    expect(result?.tenantId).toBe(tenantAId)
  })
})

// ── Scenario 3: explicit where.tenantId is overwritten ───────────────────────
//
// Key insight: the extension replaces the caller-supplied tenantId with the
// scoped value (it does NOT add a second condition). So a query with
// where: { tenantId: B } from a tenant-A context becomes where: { tenantId: A }
// at the SQL level — the caller always gets THEIR OWN data back, never B's.
// This is the correct security guarantee:
//   ✅  Attacker cannot read tenant B's records
//   ✅  Attacker's malformed query is silently corrected to their own scope

describe('Scenario 3 — explicit where: { tenantId: B } is silently overwritten with A', () => {
  it('findFirst returns own-tenant record — not null, not cross-tenant', async () => {
    // The extension replaces tenantBId with tenantAId in the WHERE clause.
    // Result: tenant A's user is found (not tenant B's, not null).
    const result = await dbA().user.findFirst({
      where: { tenantId: tenantBId }, // Attacker-supplied value
    })
    // The extension corrected it → tenant A's data is returned
    expect(result).not.toBeNull()
    expect(result?.tenantId).toBe(tenantAId) // Always own tenant
    expect(result?.tenantId).not.toBe(tenantBId) // Never cross-tenant
  })

  it('findMany returns only own-tenant records regardless of supplied tenantId', async () => {
    const results = await dbA().user.findMany({
      where: { tenantId: tenantBId }, // Attacker-supplied value
    })
    // Extension corrects the filter → only tenant A's users returned
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((u) => u.tenantId === tenantAId)).toBe(true)
    expect(results.some((u) => u.tenantId === tenantBId)).toBe(false)
  })
})

// ── Scenario 4: count is scoped to tenant ────────────────────────────────────

describe('Scenario 4 — count is scoped to the tenant', () => {
  it('per-tenant user counts are positive and the sets are disjoint', async () => {
    const [countA, countB] = await Promise.all([dbA().user.count(), dbB().user.count()])
    expect(countA).toBeGreaterThan(0)
    expect(countB).toBeGreaterThan(0)
    // Prove disjoint via base client — sum must equal total
    const total = await prisma.user.count({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    })
    expect(countA + countB).toBe(total)
  })

  it('count with wrong tenantId in WHERE returns own-tenant count (overwrite confirmed)', async () => {
    // Extension replaces tenantBId with tenantAId → same count as a plain count()
    const [countWithWrongId, countPlain] = await Promise.all([
      dbA().user.count({ where: { tenantId: tenantBId } }),
      dbA().user.count(),
    ])
    expect(countWithWrongId).toBe(countPlain) // Overwrite is in effect
    expect(countWithWrongId).toBeGreaterThan(0)
  })
})

// ── Scenario 5 & 6: create injects correct tenantId and overrides wrong value ─

describe('Scenarios 5 & 6 — create injects the correct tenantId', () => {
  const cleanup: string[] = []

  afterEach(async () => {
    if (cleanup.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: cleanup } } })
      cleanup.length = 0
    }
  })

  it('Scenario 5: tenantId supplied correctly is preserved (extension is idempotent)', async () => {
    const user = await dbA().user.create({
      data: {
        tenantId: tenantAId, // Correct value — extension will re-apply, same result
        email: `s5-${RUN_ID}@test.local`,
        name: 'Scenario 5 User',
        passwordHash: DUMMY_HASH,
        role: 'VIEWER',
      },
    })
    cleanup.push(user.id)
    expect(user.tenantId).toBe(tenantAId)

    // Record is visible from tenant A context but invisible from tenant B context
    const fromA = await dbA().user.findFirst({ where: { id: user.id } })
    const fromB = await dbB().user.findFirst({ where: { id: user.id } })
    expect(fromA).not.toBeNull()
    expect(fromB).toBeNull()
  })

  it('Scenario 6: attacker-supplied data.tenantId: B is overwritten with scoped tenantId A', async () => {
    // Simulates a bug where the wrong tenantId leaks into the create payload
    const user = await dbA().user.create({
      data: {
        tenantId: tenantBId, // Attacker supplies the wrong tenant
        email: `s6-${RUN_ID}@test.local`,
        name: 'Scenario 6 User',
        passwordHash: DUMMY_HASH,
        role: 'VIEWER',
      },
    })
    cleanup.push(user.id)

    // Extension must have overwritten tenantBId with tenantAId
    expect(user.tenantId).toBe(tenantAId)
    expect(user.tenantId).not.toBe(tenantBId)

    // Double-check via the base client
    const raw = await prisma.user.findUnique({ where: { id: user.id } })
    expect(raw?.tenantId).toBe(tenantAId)

    // Visible from tenant A, invisible from tenant B
    const fromB = await dbB().user.findFirst({ where: { id: user.id } })
    expect(fromB).toBeNull()
  })
})

// ── Scenario 7: update is scoped to tenant ───────────────────────────────────

describe("Scenario 7 — update cannot modify another tenant's record", () => {
  it('updateMany targeting cross-tenant user ID affects zero rows', async () => {
    const before = await prisma.user.findUnique({ where: { id: userBId }, select: { name: true } })

    const result = await dbA().user.updateMany({
      where: { id: userBId }, // tenant B's user ID
      data: { name: 'MUST_NOT_CHANGE' },
    })

    expect(result.count).toBe(0)

    const after = await prisma.user.findUnique({ where: { id: userBId }, select: { name: true } })
    expect(after?.name).toBe(before?.name)
  })
})

// ── Scenario 8: delete is scoped to tenant ───────────────────────────────────

describe("Scenario 8 — delete cannot remove another tenant's record", () => {
  it('deleteMany targeting cross-tenant user ID removes zero rows', async () => {
    const countBefore = await prisma.user.count({ where: { id: userBId } })

    const result = await dbA().user.deleteMany({
      where: { id: userBId }, // tenant B's user ID; WHERE gets tenantA injected → no match
    })

    expect(result.count).toBe(0)
    expect(await prisma.user.count({ where: { id: userBId } })).toBe(countBefore)
  })
})

// ── Scenario 9: non-tenant models pass through unmodified ────────────────────

describe('Scenario 9 — non-tenant models are not filtered', () => {
  it('FailureCode is visible from any tenant context', async () => {
    const [fromA, fromB, fromBase] = await Promise.all([
      dbA().failureCode.findMany({ where: { code: `INTEG-${RUN_ID}` } }),
      dbB().failureCode.findMany({ where: { code: `INTEG-${RUN_ID}` } }),
      prisma.failureCode.findMany({ where: { code: `INTEG-${RUN_ID}` } }),
    ])
    expect(fromA).toHaveLength(1)
    expect(fromB).toHaveLength(1)
    expect(fromA[0]?.id).toBe(fromBase[0]?.id) // Same record, no filtering
    expect(fromB[0]?.id).toBe(fromBase[0]?.id)
  })

  it('FailureCode count is identical from any tenant context', async () => {
    const [countA, countB, countBase] = await Promise.all([
      dbA().failureCode.count(),
      dbB().failureCode.count(),
      prisma.failureCode.count(),
    ])
    expect(countA).toBe(countBase)
    expect(countB).toBe(countBase)
  })
})
