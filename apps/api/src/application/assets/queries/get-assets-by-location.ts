/**
 * GetAssetsByLocationHandler — assets grouped by location for floor plan view.
 *
 * Returns all tenant locations that have at least one asset, each with the
 * full list of assets at that location (card projection).
 * Assets with no location are returned in a separate `ungrouped` array.
 *
 * Open WO counts are included per asset so the floor plan can highlight
 * locations with active work.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  AssetCardDto,
  AssetsByLocationGroup,
  AssetsByLocationResult,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetAssetsByLocationQuery {
  /** Filter to a specific location subtree (optional). */
  rootLocationId?: string
  /** Include only active (non-decommissioned) assets. @default true */
  activeOnly?: boolean
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetAssetsByLocationHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  async handle(
    query: GetAssetsByLocationQuery,
    ctx: QueryContext,
  ): Promise<AssetsByLocationResult> {
    const activeOnly = query.activeOnly ?? true

    // ── 1. Resolve location scope ─────────────────────────────────────────────
    let locationIds: string[] | undefined
    if (query.rootLocationId !== undefined) {
      // Load all locations in the subtree (flat — hierarchy is shallow)
      const subtreeLocations = await this.db.location.findMany({
        where: {}, // tenant filter injected by TenantClient
        select: { id: true, parentId: true },
      })

      // BFS from rootLocationId
      const inSubtree = new Set<string>([query.rootLocationId])
      let changed = true
      while (changed) {
        changed = false
        for (const loc of subtreeLocations) {
          if (loc.parentId !== null && inSubtree.has(loc.parentId) && !inSubtree.has(loc.id)) {
            inSubtree.add(loc.id)
            changed = true
          }
        }
      }
      locationIds = [...inSubtree]
    }

    // ── 2. Load assets with category + location ───────────────────────────────
    const statusFilter = activeOnly ? { not: 'DECOMMISSIONED' as const } : undefined

    const rows = await this.db.asset.findMany({
      where: {
        deletedAt: null,
        ...(statusFilter !== undefined && { status: statusFilter }),
        ...(locationIds !== undefined && { locationId: { in: locationIds } }),
      },
      orderBy: { assetNumber: 'asc' },
      select: {
        id: true,
        assetNumber: true,
        name: true,
        status: true,
        criticality: true,
        categoryId: true,
        locationId: true,
        parentId: true,
        manufacturer: true,
        model: true,
        serialNumber: true,
        installDate: true,
        warrantyExpiry: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        location: { select: { id: true, code: true, name: true, parentId: true } },
        parent: { select: { id: true, name: true } },
      },
    })

    if (rows.length === 0) {
      return { groups: [], ungrouped: [], totalAssets: 0 }
    }

    // ── 3. Load open WO counts ────────────────────────────────────────────────
    const assetIds = rows.map((r) => r.id)
    const openWORows = await this.prisma.workOrder.groupBy({
      by: ['assetId'],
      where: {
        tenantId: ctx.tenantId,
        assetId: { in: assetIds },
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      _count: { _all: true },
    })
    // eslint-disable-next-line no-underscore-dangle
    const openWOByAsset = new Map(openWORows.map((r) => [r.assetId, r._count._all]))

    // ── 4. Project rows to AssetCardDto ───────────────────────────────────────
    const now = new Date()

    const toCard = (r: (typeof rows)[number]): AssetCardDto => ({
      id: r.id,
      assetNumber: r.assetNumber,
      name: r.name,
      status: r.status,
      criticality: r.criticality,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      locationId: r.locationId ?? null,
      locationName: r.location?.name ?? null,
      parentId: r.parentId ?? null,
      parentName: r.parent?.name ?? null,
      manufacturer: r.manufacturer ?? null,
      model: r.model ?? null,
      serialNumber: r.serialNumber ?? null,
      installDate: r.installDate?.toISOString() ?? null,
      warrantyExpiry: r.warrantyExpiry?.toISOString() ?? null,
      isWarrantyActive: r.warrantyExpiry !== null && r.warrantyExpiry > now,
      openWOCount: openWOByAsset.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })

    // ── 5. Group by location ──────────────────────────────────────────────────
    const ungrouped: AssetCardDto[] = []
    const locationMap = new Map<
      string,
      {
        locationCode: string
        locationName: string
        parentLocationId: string | null
        assets: AssetCardDto[]
      }
    >()

    for (const r of rows) {
      const card = toCard(r)

      if (r.locationId === null || r.location === null) {
        ungrouped.push(card)
      } else {
        const existing = locationMap.get(r.locationId)
        if (existing) {
          existing.assets.push(card)
        } else {
          locationMap.set(r.locationId, {
            locationCode: r.location.code,
            locationName: r.location.name,
            parentLocationId: r.location.parentId ?? null,
            assets: [card],
          })
        }
      }
    }

    const groups: AssetsByLocationGroup[] = [...locationMap.entries()].map(
      ([locationId, data]) => ({
        locationId,
        locationCode: data.locationCode,
        locationName: data.locationName,
        parentLocationId: data.parentLocationId,
        assets: data.assets,
        openWOCount: data.assets.reduce((sum, a) => sum + a.openWOCount, 0),
      }),
    )

    return {
      groups,
      ungrouped,
      totalAssets: rows.length,
    }
  }
}
