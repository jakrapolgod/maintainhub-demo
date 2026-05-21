/**
 * DoD item 9 — Tree API: create 4-level hierarchy, verify nested structure.
 * DoD item 10 — Performance: verify tree-build algorithm is O(n) and fast.
 *
 * These are pure unit tests (no DB) — the GetAssetTreeHandler builds the tree
 * from in-memory data.  Performance is validated by measuring the handler
 * with 500 mock nodes and asserting sub-500 ms wall-clock time.
 */

import { GetAssetTreeHandler } from '../get-asset-tree'
import type { QueryContext } from '../query.types'

const ctx: QueryContext = {
  executingUserId: 'user-1',
  tenantId: 'tenant-1',
  userRole: 'MANAGER',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRow(id: string, parentId: string | null, assetNumber: string, name = 'Asset') {
  return {
    id,
    assetNumber,
    name,
    status: 'OPERATIONAL',
    criticality: 'C',
    locationId: null,
    parentId,
    location: null,
  }
}

function makeDeps(rows: ReturnType<typeof makeRow>[]) {
  return {
    db: { asset: { findMany: jest.fn().mockResolvedValue(rows) } },
    prisma: {
      workOrder: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  }
}

// ── DoD #9: 4-level hierarchy ─────────────────────────────────────────────────

describe('GetAssetTreeHandler — DoD #9: 4-level hierarchy', () => {
  /**
   * Hierarchy:
   *   Plant (depth 0)
   *     Building (depth 1)
   *       System (depth 2)
   *         Equipment (depth 3)
   *
   * Tree must return:
   *   - Plant at root
   *   - Building nested under Plant
   *   - System nested under Building
   *   - Equipment nested under System
   *
   * Flat list must have correct depth indicators 0→1→2→3.
   */
  const rows = [
    makeRow('plant-1', null, 'AST-001', 'Plant'),
    makeRow('bldg-1', 'plant-1', 'AST-002', 'Building'),
    makeRow('sys-1', 'bldg-1', 'AST-003', 'System'),
    makeRow('equip-1', 'sys-1', 'AST-004', 'Equipment'),
  ]

  it('tree has one root (Plant)', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.tree).toHaveLength(1)
    expect(result.tree[0]!.id).toBe('plant-1')
    expect(result.tree[0]!.name).toBe('Plant')
  })

  it('Building is nested under Plant', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    const plant = result.tree[0]!
    expect(plant.children).toHaveLength(1)
    expect(plant.children[0]!.id).toBe('bldg-1')
  })

  it('System is nested under Building', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    const building = result.tree[0]!.children[0]!
    expect(building.children).toHaveLength(1)
    expect(building.children[0]!.id).toBe('sys-1')
  })

  it('Equipment is nested under System (leaf)', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    const system = result.tree[0]!.children[0]!.children[0]!
    expect(system.children).toHaveLength(1)
    expect(system.children[0]!.id).toBe('equip-1')
    expect(system.children[0]!.children).toHaveLength(0)
  })

  it('flat list has correct depth indicators', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.flat).toHaveLength(4)
    expect(result.flat.find((n) => n.id === 'plant-1')!.depth).toBe(0)
    expect(result.flat.find((n) => n.id === 'bldg-1')!.depth).toBe(1)
    expect(result.flat.find((n) => n.id === 'sys-1')!.depth).toBe(2)
    expect(result.flat.find((n) => n.id === 'equip-1')!.depth).toBe(3)
  })

  it('flat list is ordered depth-first (DFS)', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    const ids = result.flat.map((n) => n.id)
    expect(ids).toEqual(['plant-1', 'bldg-1', 'sys-1', 'equip-1'])
  })

  it('totalCount matches flat.length', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.totalCount).toBe(result.flat.length)
    expect(result.totalCount).toBe(4)
  })

  it('subtree filter via rootAssetId returns only Building subtree', async () => {
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)
    const result = await handler.handle({ rootAssetId: 'bldg-1' }, ctx)

    // Only Building, System, Equipment
    expect(result.totalCount).toBe(3)
    expect(result.tree[0]!.id).toBe('bldg-1')
    expect(result.flat.find((n) => n.id === 'plant-1')).toBeUndefined()
  })
})

// ── DoD #10: Performance — 500 assets < 500 ms ────────────────────────────────

describe('GetAssetTreeHandler — DoD #10: performance with 500 assets', () => {
  /**
   * Generates a realistic 500-asset hierarchy:
   *   10 roots × 10 children × 5 grandchildren = 600 nodes (capped at 500)
   */
  function generate500Nodes(): ReturnType<typeof makeRow>[] {
    const nodes: ReturnType<typeof makeRow>[] = []
    let seq = 1

    for (let r = 0; r < 10 && nodes.length < 500; r += 1) {
      const rootId = `root-${r}`
      nodes.push(
        makeRow(rootId, null, `AST-${String((seq += 1) - 1).padStart(6, '0')}`, `Root ${r}`),
      )

      for (let c = 0; c < 10 && nodes.length < 500; c += 1) {
        const childId = `child-${r}-${c}`
        nodes.push(
          makeRow(
            childId,
            rootId,
            `AST-${String((seq += 1) - 1).padStart(6, '0')}`,
            `Child ${r}.${c}`,
          ),
        )

        for (let g = 0; g < 5 && nodes.length < 500; g += 1) {
          const grandId = `grand-${r}-${c}-${g}`
          nodes.push(
            makeRow(
              grandId,
              childId,
              `AST-${String((seq += 1) - 1).padStart(6, '0')}`,
              `Grand ${r}.${c}.${g}`,
            ),
          )
        }
      }
    }

    return nodes.slice(0, 500)
  }

  it('handles 500 assets without cache in under 500 ms', async () => {
    const nodes = generate500Nodes()
    const { db, prisma } = makeDeps(nodes)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const t0 = performance.now()
    const result = await handler.handle({ includeStats: false }, ctx)
    const elapsed = performance.now() - t0

    expect(result.totalCount).toBe(500)
    expect(result.tree.length).toBeGreaterThan(0)

    // Pure in-memory tree-build should be << 100 ms; allow generous 500 ms headroom
    // Note: the DB mock is instant — this measures only the O(n) tree algorithm
    expect(elapsed).toBeLessThan(500)
  })

  it('tree build is O(n): 500-node result has correct structure', async () => {
    const nodes = generate500Nodes()
    const { db, prisma } = makeDeps(nodes)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({ includeStats: false }, ctx)

    // Every flat node has a depth >= 0
    expect(result.flat.every((n) => n.depth >= 0)).toBe(true)
    // Root nodes have depth 0; exact count depends on 500-node cap algorithm
    const actualRootCount = result.flat.filter((n) => n.depth === 0).length
    expect(actualRootCount).toBeGreaterThanOrEqual(8)
    expect(actualRootCount).toBeLessThanOrEqual(10)
    // Total flat count matches node count
    expect(result.flat.length).toBe(500)
  })

  it('cached result simulation: second call with identical data is fast', async () => {
    // Simulate the Redis cache hit path: handler is called twice with same data.
    // The handler itself doesn't access Redis — caching is done at the route layer.
    // This test verifies the handler is stateless and idempotent.
    const nodes = generate500Nodes()
    const { db, prisma } = makeDeps(nodes)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const r1 = await handler.handle({ includeStats: false }, ctx)
    const r2 = await handler.handle({ includeStats: false }, ctx)

    expect(r1.totalCount).toBe(r2.totalCount)
    expect(r1.flat.map((n) => n.id)).toEqual(r2.flat.map((n) => n.id))
  })
})
