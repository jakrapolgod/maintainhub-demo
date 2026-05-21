import { GetAssetTreeHandler } from '../get-asset-tree'
import type { QueryContext } from '../query.types'

const TENANT = 'tenant-1'
const USER_ID = 'user-1'
const ctx: QueryContext = { executingUserId: USER_ID, tenantId: TENANT, userRole: 'MANAGER' }

function makeRow(id: string, parentId: string | null, assetNumber: string, name: string) {
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

function makeDeps(
  rows: ReturnType<typeof makeRow>[],
  openWORows: { assetId: string; _count: { _all: number } }[] = [],
  lastMainRows: { assetId: string; completedAt: Date }[] = [],
) {
  const db = {
    asset: { findMany: jest.fn().mockResolvedValue(rows) },
    location: { findMany: jest.fn().mockResolvedValue([]) },
  }
  const prisma = {
    workOrder: {
      groupBy: jest.fn().mockResolvedValue(openWORows),
      findMany: jest.fn().mockResolvedValue(lastMainRows),
    },
  }
  return { db, prisma }
}

describe('GetAssetTreeHandler', () => {
  it('returns empty result when no assets exist', async () => {
    const { db, prisma } = makeDeps([])
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree).toHaveLength(0)
    expect(result.flat).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('builds a two-level tree (root + child)', async () => {
    const rows = [
      makeRow('root-1', null, 'AST-000001', 'Plant'),
      makeRow('child-1', 'root-1', 'AST-000002', 'Building A'),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree).toHaveLength(1)
    expect(result.tree[0]!.id).toBe('root-1')
    expect(result.tree[0]!.children).toHaveLength(1)
    expect(result.tree[0]!.children[0]!.id).toBe('child-1')
  })

  it('flat list has correct depth values', async () => {
    const rows = [
      makeRow('root-1', null, 'AST-000001', 'Plant'),
      makeRow('child-1', 'root-1', 'AST-000002', 'Building A'),
      makeRow('grand-1', 'child-1', 'AST-000003', 'System'),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.flat).toHaveLength(3)
    expect(result.flat.find((n) => n.id === 'root-1')!.depth).toBe(0)
    expect(result.flat.find((n) => n.id === 'child-1')!.depth).toBe(1)
    expect(result.flat.find((n) => n.id === 'grand-1')!.depth).toBe(2)
  })

  it('filters to subtree when rootAssetId is provided', async () => {
    const rows = [
      makeRow('root-1', null, 'AST-000001', 'Plant'),
      makeRow('child-1', 'root-1', 'AST-000002', 'Building A'),
      makeRow('child-2', 'root-1', 'AST-000003', 'Building B'),
      makeRow('root-2', null, 'AST-000010', 'Other Plant'),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({ rootAssetId: 'root-1' }, ctx)

    expect(result.tree).toHaveLength(1)
    expect(result.tree[0]!.id).toBe('root-1')
    // flat includes root and both children
    const flatIds = result.flat.map((n) => n.id)
    expect(flatIds).toContain('root-1')
    expect(flatIds).toContain('child-1')
    expect(flatIds).toContain('child-2')
    expect(flatIds).not.toContain('root-2')
  })

  it('returns empty tree when rootAssetId does not match any asset', async () => {
    const rows = [makeRow('root-1', null, 'AST-000001', 'Plant')]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({ rootAssetId: 'non-existent' }, ctx)

    expect(result.tree).toHaveLength(0)
    expect(result.flat).toHaveLength(0)
  })

  it('assigns open WO counts from groupBy result', async () => {
    const rows = [makeRow('root-1', null, 'AST-000001', 'Plant')]
    const openWORows = [{ assetId: 'root-1', _count: { _all: 3 } }]
    const { db, prisma } = makeDeps(rows, openWORows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree[0]!.openWOCount).toBe(3)
    expect(result.flat[0]!.openWOCount).toBe(3)
  })

  it('assigns 0 open WOs when asset has no open work orders', async () => {
    const rows = [makeRow('root-1', null, 'AST-000001', 'Plant')]
    const { db, prisma } = makeDeps(rows, [])
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree[0]!.openWOCount).toBe(0)
  })

  it('assigns last maintenance date from most recent completed WO', async () => {
    const rows = [makeRow('root-1', null, 'AST-000001', 'Plant')]
    const lastDate = new Date('2024-05-10T08:00:00Z')
    const lastMainRows = [{ assetId: 'root-1', completedAt: lastDate }]
    const { db, prisma } = makeDeps(rows, [], lastMainRows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree[0]!.lastMaintenanceDate).toBe(lastDate.toISOString())
  })

  it('handles multiple roots correctly', async () => {
    const rows = [
      makeRow('root-1', null, 'AST-000001', 'Plant A'),
      makeRow('root-2', null, 'AST-000002', 'Plant B'),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.tree).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('totalCount equals flat list length', async () => {
    const rows = [
      makeRow('root-1', null, 'AST-000001', 'Plant'),
      makeRow('child-1', 'root-1', 'AST-000002', 'B'),
      makeRow('child-2', 'root-1', 'AST-000003', 'C'),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetTreeHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.totalCount).toBe(result.flat.length)
  })
})
