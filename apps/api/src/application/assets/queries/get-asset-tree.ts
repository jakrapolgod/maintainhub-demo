/**
 * GetAssetTreeHandler — full hierarchy as a nested tree or flat list.
 *
 * ## Algorithm
 *
 * 1. Load ALL non-deleted assets for the tenant in a single query (select slim
 *    fields only — no relations).
 * 2. Load open-WO counts and last-maintenance dates in two parallel queries.
 * 3. Build the tree in memory — O(n) with a Map lookup.
 *
 * This avoids recursive CTEs for the tree build at the application layer.
 * For tenants with very large asset registries (>5000 assets) a CTE-based
 * approach scoped to a root subtree is recommended (future optimisation).
 *
 * ## View modes
 *   tree — nested `AssetTreeNode` array (one entry per root asset)
 *   flat — ordered list with `depth` field for indentation in tables
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type { QueryContext, AssetTreeNode, AssetFlatNode, AssetTreeResult } from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetAssetTreeQuery {
  /** When provided, return only the subtree rooted at this asset. Omit for all roots. */
  rootAssetId?: string
  /** Include open WO count and last maintenance date per node. @default true */
  includeStats?: boolean
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetAssetTreeHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  async handle(query: GetAssetTreeQuery, ctx: QueryContext): Promise<AssetTreeResult> {
    const includeStats = query.includeStats ?? true

    // ── 1. Load all assets (slim projection) ──────────────────────────────────
    const rows = await this.db.asset.findMany({
      where: { deletedAt: null },
      orderBy: { assetNumber: 'asc' },
      select: {
        id: true,
        assetNumber: true,
        name: true,
        status: true,
        criticality: true,
        locationId: true,
        parentId: true,
        location: { select: { id: true, name: true } },
      },
    })

    if (rows.length === 0) {
      return { tree: [], flat: [], totalCount: 0 }
    }

    // ── 2. Load per-asset stats in parallel ───────────────────────────────────
    const assetIds = rows.map((r) => r.id)

    const [openWORows, lastMaintenanceRows] = includeStats
      ? await Promise.all([
          // Open WO count per asset
          this.prisma.workOrder.groupBy({
            by: ['assetId'],
            where: {
              tenantId: ctx.tenantId,
              assetId: { in: assetIds },
              deletedAt: null,
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
            _count: { _all: true },
          }),

          // Last completed WO per asset
          this.prisma.workOrder.findMany({
            where: {
              tenantId: ctx.tenantId,
              assetId: { in: assetIds },
              status: 'COMPLETED',
              deletedAt: null,
              completedAt: { not: null },
            },
            orderBy: { completedAt: 'desc' },
            select: { assetId: true, completedAt: true },
            // Keep only the most recent per asset — deduplicate in memory
          }),
        ])
      : ([[], []] as const)

    // Build lookup maps
    // eslint-disable-next-line no-underscore-dangle
    const openWOByAsset = new Map(openWORows.map((r) => [r.assetId, r._count._all]))

    // Keep only latest completedAt per assetId
    const lastMaintenanceByAsset = new Map<string, Date>()
    for (const r of lastMaintenanceRows) {
      if (r.completedAt && !lastMaintenanceByAsset.has(r.assetId)) {
        lastMaintenanceByAsset.set(r.assetId, r.completedAt)
      }
    }

    // ── 3. Build node map ─────────────────────────────────────────────────────
    const nodeById = new Map<string, AssetTreeNode>()
    for (const r of rows) {
      nodeById.set(r.id, {
        id: r.id,
        assetNumber: r.assetNumber,
        name: r.name,
        status: r.status,
        criticality: r.criticality,
        locationId: r.locationId ?? null,
        locationName: r.location?.name ?? null,
        openWOCount: openWOByAsset.get(r.id) ?? 0,
        lastMaintenanceDate: lastMaintenanceByAsset.get(r.id)?.toISOString() ?? null,
        children: [],
      })
    }

    // ── 4. Attach children to parents ─────────────────────────────────────────
    const roots: AssetTreeNode[] = []
    for (const r of rows) {
      const node = nodeById.get(r.id)!
      if (r.parentId !== null) {
        const parent = nodeById.get(r.parentId)
        if (parent) {
          parent.children.push(node)
        } else {
          // Orphaned node (parent outside tenant scope) — treat as root
          roots.push(node)
        }
      } else {
        roots.push(node)
      }
    }

    // ── 5. Filter to subtree when rootAssetId is provided ─────────────────────
    let tree: AssetTreeNode[]
    if (query.rootAssetId !== undefined) {
      const rootNode = nodeById.get(query.rootAssetId)
      tree = rootNode !== undefined ? [rootNode] : []
    } else {
      tree = roots
    }

    // ── 6. Build flat list via DFS ────────────────────────────────────────────
    const flat: AssetFlatNode[] = []
    const visited = new Set<string>()

    const dfs = (node: AssetTreeNode, depth: number, parentId: string | null) => {
      if (visited.has(node.id)) return // cycle guard
      visited.add(node.id)

      flat.push({
        id: node.id,
        assetNumber: node.assetNumber,
        name: node.name,
        status: node.status,
        criticality: node.criticality,
        locationId: node.locationId,
        locationName: node.locationName,
        parentId,
        depth,
        openWOCount: node.openWOCount,
        lastMaintenanceDate: node.lastMaintenanceDate,
      })

      for (const child of node.children) {
        dfs(child, depth + 1, node.id)
      }
    }

    for (const root of tree) {
      dfs(root, 0, null)
    }

    return {
      tree,
      flat,
      totalCount: flat.length,
    }
  }
}
