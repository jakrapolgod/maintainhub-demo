/**
 * GetAssetsNeedingAttentionHandler — surfaces assets that require immediate
 * action by maintenance managers.
 *
 * ## Attention criteria (a single asset may trigger multiple reasons)
 *
 *   OVERDUE_PM           — has at least one active PM schedule whose `nextDue`
 *                          is in the past and status ≠ DECOMMISSIONED.
 *
 *   WARRANTY_EXPIRING    — `warrantyExpiry` is within the next 30 days
 *                          (configurable via `warrantyWarningDays`).
 *
 *   HIGH_MTTR            — average repair time (CORRECTIVE WOs, last 90 days)
 *                          exceeds `highMttrThresholdHours` (default 24 h).
 *
 *   OPEN_EMERGENCY_WO    — has at least one open (non-terminal) EMERGENCY
 *                          work order right now.
 *
 * ## Performance
 *
 * All DB queries run in parallel.  Results are merged in memory.
 * For large tenants (>10k assets) add indexes on `pm_schedules.next_due`
 * and `work_orders.type + status`.
 */
import type { PrismaClient } from '@prisma/client'
import {
  WorkOrder,
  WorkOrderId,
  WorkOrderStatus,
  Priority,
  AssetMetricsService,
} from '@maintainhub/domain'
import type { WorkOrderProps } from '@maintainhub/domain'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  AssetCardDto,
  AssetAttentionItem,
  AssetsNeedingAttentionResult,
  AttentionReason,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetAssetsNeedingAttentionQuery {
  /** Days before warranty expiry to start warning. @default 30 */
  warrantyWarningDays?: number
  /** Average MTTR (hours) above which an asset is flagged. @default 24 */
  highMttrThresholdHours?: number
  /** Look-back window (days) for MTTR calculation. @default 90 */
  mttrLookbackDays?: number
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetAssetsNeedingAttentionHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  async handle(
    query: GetAssetsNeedingAttentionQuery,
    ctx: QueryContext,
  ): Promise<AssetsNeedingAttentionResult> {
    const now = new Date()
    const warrantyDays = query.warrantyWarningDays ?? 30
    const mttrThreshold = query.highMttrThresholdHours ?? 24
    const mttrLookbackDays = query.mttrLookbackDays ?? 90

    const warrantyDeadline = new Date(now.getTime() + warrantyDays * 86_400_000)
    const mttrLookbackDate = new Date(now.getTime() - mttrLookbackDays * 86_400_000)

    // ── 1. Run all signal queries in parallel ──────────────────────────────────
    const [overduePMRows, warrantyRows, emergencyWORows, mttrWORows] = await Promise.all([
      // Overdue PM: active schedules with nextDue < now
      this.db.pMSchedule.findMany({
        where: {
          isActive: true,
          nextDue: { lt: now },
          asset: { deletedAt: null, status: { not: 'DECOMMISSIONED' } },
        },
        select: { assetId: true, nextDue: true },
        distinct: ['assetId'],
        orderBy: { nextDue: 'asc' },
      }),

      // Warranty expiring within warrantyDays
      this.db.asset.findMany({
        where: {
          deletedAt: null,
          status: { not: 'DECOMMISSIONED' },
          warrantyExpiry: { gte: now, lte: warrantyDeadline },
        },
        select: { id: true, warrantyExpiry: true },
      }),

      // Open EMERGENCY work orders (not COMPLETED or CANCELLED)
      this.db.workOrder.findMany({
        where: {
          type: 'EMERGENCY',
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          deletedAt: null,
        },
        select: { assetId: true },
        distinct: ['assetId'],
      }),

      // CORRECTIVE WOs in lookback window — for MTTR calculation
      this.prisma.workOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          type: 'CORRECTIVE',
          status: 'COMPLETED',
          deletedAt: null,
          completedAt: { gte: mttrLookbackDate, lte: now },
          startedAt: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          woNumber: true,
          type: true,
          status: true,
          assetId: true,
          createdById: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    // ── 2. Build signal sets ───────────────────────────────────────────────────
    const overduePMByAsset = new Map(overduePMRows.map((r) => [r.assetId, r.nextDue]))
    const warrantyByAsset = new Map(warrantyRows.map((r) => [r.id, r.warrantyExpiry]))
    const emergencyAssets = new Set(emergencyWORows.map((r) => r.assetId))

    // Group MTTR WOs by assetId
    const mttrWOsByAsset = new Map<string, typeof mttrWORows>()
    for (const wo of mttrWORows) {
      const existing = mttrWOsByAsset.get(wo.assetId) ?? []
      existing.push(wo)
      mttrWOsByAsset.set(wo.assetId, existing)
    }

    // Compute MTTR per asset
    const highMttrByAsset = new Map<string, number>()
    for (const [assetId, wos] of mttrWOsByAsset) {
      const domainWOs: WorkOrder[] = wos.map((r) =>
        WorkOrder.reconstitute({
          id: new WorkOrderId(r.id),
          tenantId: r.tenantId,
          woNumber: r.woNumber,
          title: '',
          type: r.type as 'CORRECTIVE',
          priority: Priority.from('MEDIUM'),
          status: WorkOrderStatus.COMPLETED,
          assetId: r.assetId,
          createdById: r.createdById,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          ...(r.startedAt !== null && { startedAt: r.startedAt }),
          ...(r.completedAt !== null && { completedAt: r.completedAt }),
        } satisfies WorkOrderProps),
      )

      const mttr = AssetMetricsService.calculateMTTR(domainWOs)
      if (mttr.hours >= mttrThreshold) {
        highMttrByAsset.set(assetId, mttr.hours)
      }
    }

    // ── 3. Collect all attention asset IDs ────────────────────────────────────
    const attentionIds = new Set<string>([
      ...overduePMByAsset.keys(),
      ...warrantyByAsset.keys(),
      ...emergencyAssets,
      ...highMttrByAsset.keys(),
    ])

    if (attentionIds.size === 0) {
      return { items: [], totalCount: 0 }
    }

    // ── 4. Load asset cards for attention assets ───────────────────────────────
    const assetRows = await this.db.asset.findMany({
      where: { id: { in: [...attentionIds] }, deletedAt: null },
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
        location: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
      },
    })

    // Open WO count for attention assets
    const openWORows = await this.db.workOrder.groupBy({
      by: ['assetId'],
      where: {
        assetId: { in: [...attentionIds] },
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      _count: { _all: true },
    })
    // eslint-disable-next-line no-underscore-dangle
    const openWOByAsset = new Map(openWORows.map((r) => [r.assetId, r._count._all]))

    // ── 5. Build result items ─────────────────────────────────────────────────
    const items: AssetAttentionItem[] = assetRows.map((r) => {
      const card: AssetCardDto = {
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
      }

      const reasons: AttentionReason[] = []
      if (overduePMByAsset.has(r.id)) reasons.push('OVERDUE_PM')
      if (warrantyByAsset.has(r.id)) reasons.push('WARRANTY_EXPIRING')
      if (emergencyAssets.has(r.id)) reasons.push('OPEN_EMERGENCY_WO')
      if (highMttrByAsset.has(r.id)) reasons.push('HIGH_MTTR')

      const overduePMDate = overduePMByAsset.get(r.id)
      const warrantyExpiry = warrantyByAsset.get(r.id)
      const dueDate = overduePMDate?.toISOString() ?? warrantyExpiry?.toISOString() ?? null

      return {
        asset: card,
        reasons,
        dueDate,
        mttrHours: highMttrByAsset.get(r.id) ?? null,
      }
    })

    return { items, totalCount: items.length }
  }
}
