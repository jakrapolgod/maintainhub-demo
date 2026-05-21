import { Prisma } from '@prisma/client'
import type { AuditMeta } from '../lib/audit'
import { DomainException } from '../errors/domain.exception'
import type { TenantClient } from '../lib/tenant-prisma'
import type {
  CreateAssetCategoryDto,
  CreateAssetDto,
  CreateLocationDto,
  ListAssetQuery,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
  UpdateLocationDto,
} from '../schemas/asset'

// ── Pagination helper ─────────────────────────────────────────────────────────

interface Paginated<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AssetService {
  constructor(
    private readonly db: TenantClient,
    private readonly tenantId: string,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Asset Categories
  // ══════════════════════════════════════════════════════════════════════════

  async listCategories() {
    return this.db.assetCategory.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, createdAt: true },
    })
  }

  async createCategory(dto: CreateAssetCategoryDto, audit: AuditMeta) {
    const existing = await this.db.assetCategory.findFirst({
      where: { code: dto.code },
      select: { id: true },
    })
    if (existing) {
      throw new DomainException(`Category code "${dto.code}" already exists`, 'DUPLICATE_CODE', 409)
    }

    const category = await this.db.assetCategory.create({
      data: { tenantId: this.tenantId, code: dto.code, name: dto.name },
      select: { id: true, code: true, name: true, createdAt: true },
    })

    await this.writeAudit({ ...audit, action: 'CREATE_ASSET_CATEGORY', entityId: category.id, after: dto })
    return category
  }

  async updateCategory(id: string, dto: UpdateAssetCategoryDto, audit: AuditMeta) {
    const existing = await this.db.assetCategory.findFirst({
      where: { id },
      select: { id: true, name: true },
    })
    if (!existing) throw new DomainException('Asset category not found', 'NOT_FOUND', 404)

    const category = await this.db.assetCategory.update({
      where: { id },
      data: { ...(dto.name !== undefined && { name: dto.name }) },
      select: { id: true, code: true, name: true, createdAt: true },
    })

    await this.writeAudit({ ...audit, action: 'UPDATE_ASSET_CATEGORY', entityId: id, before: { name: existing.name }, after: dto })
    return category
  }

  async deleteCategory(id: string, audit: AuditMeta) {
    const existing = await this.db.assetCategory.findFirst({
      where: { id },
      select: { id: true, code: true },
    })
    if (!existing) throw new DomainException('Asset category not found', 'NOT_FOUND', 404)

    // Refuse if assets are using this category
    const assetCount = await this.db.asset.count({ where: { categoryId: id, deletedAt: null } })
    if (assetCount > 0) {
      throw new DomainException(
        `Cannot delete category — ${assetCount} asset(s) still reference it`,
        'CATEGORY_IN_USE',
        409,
      )
    }

    await this.db.assetCategory.delete({ where: { id } })
    await this.writeAudit({ ...audit, action: 'DELETE_ASSET_CATEGORY', entityId: id, before: existing })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Locations
  // ══════════════════════════════════════════════════════════════════════════

  async listLocations() {
    const all = await this.db.location.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, parentId: true, createdAt: true },
    })
    return all
  }

  async createLocation(dto: CreateLocationDto, audit: AuditMeta) {
    const existing = await this.db.location.findFirst({
      where: { code: dto.code },
      select: { id: true },
    })
    if (existing) {
      throw new DomainException(`Location code "${dto.code}" already exists`, 'DUPLICATE_CODE', 409)
    }

    if (dto.parentId) {
      const parent = await this.db.location.findFirst({ where: { id: dto.parentId }, select: { id: true } })
      if (!parent) throw new DomainException('Parent location not found', 'NOT_FOUND', 404)
    }

    const location = await this.db.location.create({
      data: {
        tenantId: this.tenantId,
        code: dto.code,
        name: dto.name,
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
      select: { id: true, code: true, name: true, parentId: true, createdAt: true },
    })

    await this.writeAudit({ ...audit, action: 'CREATE_LOCATION', entityId: location.id, after: dto })
    return location
  }

  async updateLocation(id: string, dto: UpdateLocationDto, audit: AuditMeta) {
    const existing = await this.db.location.findFirst({ where: { id }, select: { id: true, name: true, parentId: true } })
    if (!existing) throw new DomainException('Location not found', 'NOT_FOUND', 404)

    if (dto.parentId && dto.parentId !== null) {
      // Prevent creating a cycle: new parent must not be a descendant of this location
      if (dto.parentId === id) {
        throw new DomainException('A location cannot be its own parent', 'INVALID_OPERATION', 422)
      }
      const parent = await this.db.location.findFirst({ where: { id: dto.parentId }, select: { id: true } })
      if (!parent) throw new DomainException('Parent location not found', 'NOT_FOUND', 404)
    }

    const location = await this.db.location.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
      select: { id: true, code: true, name: true, parentId: true, updatedAt: true },
    })

    await this.writeAudit({ ...audit, action: 'UPDATE_LOCATION', entityId: id, before: existing, after: dto })
    return location
  }

  async deleteLocation(id: string, audit: AuditMeta) {
    const existing = await this.db.location.findFirst({ where: { id }, select: { id: true, code: true } })
    if (!existing) throw new DomainException('Location not found', 'NOT_FOUND', 404)

    const childCount = await this.db.location.count({ where: { parentId: id } })
    if (childCount > 0) {
      throw new DomainException(
        `Cannot delete location — ${childCount} child location(s) exist`,
        'LOCATION_HAS_CHILDREN',
        409,
      )
    }

    const assetCount = await this.db.asset.count({ where: { locationId: id, deletedAt: null } })
    if (assetCount > 0) {
      throw new DomainException(
        `Cannot delete location — ${assetCount} asset(s) are assigned to it`,
        'LOCATION_IN_USE',
        409,
      )
    }

    await this.db.location.delete({ where: { id } })
    await this.writeAudit({ ...audit, action: 'DELETE_LOCATION', entityId: id, before: existing })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Assets
  // ══════════════════════════════════════════════════════════════════════════

  async list(query: ListAssetQuery): Promise<Paginated<unknown>> {
    const { page, limit, status, criticality, categoryId, locationId, parentId, search } = query
    const skip = (page - 1) * limit

    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...(status !== undefined && { status }),
      ...(criticality !== undefined && { criticality }),
      ...(categoryId !== undefined && { categoryId }),
      ...(locationId !== undefined && { locationId }),
      ...(parentId !== undefined && { parentId }),
      ...(search !== undefined && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { assetNumber: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      this.db.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ assetNumber: 'asc' }],
        select: {
          id: true, assetNumber: true, name: true, status: true, criticality: true,
          manufacturer: true, model: true, installDate: true, warrantyExpiry: true,
          createdAt: true, updatedAt: true,
          category: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
          parent: { select: { id: true, assetNumber: true, name: true } },
          _count: { select: { children: true, workOrders: true } },
        },
      }),
      this.db.asset.count({ where }),
    ])

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id: string): Promise<unknown> {
    const asset = await this.db.asset.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, assetNumber: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, assetNumber: true, name: true, status: true, criticality: true },
          orderBy: { assetNumber: 'asc' },
        },
        pmSchedules: {
          where: { isActive: true },
          select: { id: true, title: true, triggerType: true, nextDue: true },
          orderBy: { nextDue: 'asc' },
        },
      },
    })
    if (!asset) throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    return asset
  }

  async create(dto: CreateAssetDto, audit: AuditMeta): Promise<unknown> {
    // Validate category belongs to this tenant (tenant filter handles it, but gives a better error)
    const category = await this.db.assetCategory.findFirst({ where: { id: dto.categoryId }, select: { id: true } })
    if (!category) throw new DomainException('Asset category not found', 'NOT_FOUND', 404)

    // Validate uniqueness of assetNumber within tenant
    const existing = await this.db.asset.findFirst({
      where: { assetNumber: dto.assetNumber, deletedAt: null },
      select: { id: true },
    })
    if (existing) {
      throw new DomainException(`Asset number "${dto.assetNumber}" already exists`, 'DUPLICATE_ASSET_NUMBER', 409)
    }

    if (dto.parentId) {
      const parent = await this.db.asset.findFirst({ where: { id: dto.parentId, deletedAt: null }, select: { id: true } })
      if (!parent) throw new DomainException('Parent asset not found', 'NOT_FOUND', 404)
    }

    const asset = await this.db.asset.create({
      data: {
        tenantId: this.tenantId,
        assetNumber: dto.assetNumber,
        name: dto.name,
        categoryId: dto.categoryId,
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.criticality !== undefined && { criticality: dto.criticality }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.installDate !== undefined && { installDate: dto.installDate }),
        ...(dto.warrantyExpiry !== undefined && { warrantyExpiry: dto.warrantyExpiry }),
        ...(dto.purchaseCost !== undefined && { purchaseCost: new Prisma.Decimal(dto.purchaseCost) }),
        ...(dto.customFields !== undefined && { customFields: dto.customFields }),
      },
      include: {
        category: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, assetNumber: true, name: true } },
      },
    })

    await this.writeAudit({ ...audit, action: 'CREATE_ASSET', entityId: asset.id, after: { assetNumber: dto.assetNumber, name: dto.name } })
    return asset
  }

  async update(id: string, dto: UpdateAssetDto, audit: AuditMeta): Promise<unknown> {
    const existing = await this.db.asset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, status: true },
    })
    if (!existing) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

    if (dto.categoryId) {
      const cat = await this.db.assetCategory.findFirst({ where: { id: dto.categoryId }, select: { id: true } })
      if (!cat) throw new DomainException('Asset category not found', 'NOT_FOUND', 404)
    }

    const asset = await this.db.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.criticality !== undefined && { criticality: dto.criticality }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.installDate !== undefined && { installDate: dto.installDate }),
        ...(dto.warrantyExpiry !== undefined && { warrantyExpiry: dto.warrantyExpiry }),
        ...(dto.purchaseCost !== undefined && {
          purchaseCost: dto.purchaseCost !== null ? new Prisma.Decimal(dto.purchaseCost) : null,
        }),
        ...(dto.customFields !== undefined && { customFields: dto.customFields }),
      },
      include: {
        category: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, assetNumber: true, name: true } },
      },
    })

    await this.writeAudit({ ...audit, action: 'UPDATE_ASSET', entityId: id, before: existing, after: dto })
    return asset
  }

  async softDelete(id: string, audit: AuditMeta): Promise<void> {
    const existing = await this.db.asset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, assetNumber: true },
    })
    if (!existing) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

    const openWoCount = await this.db.workOrder.count({
      where: {
        assetId: id,
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    })
    if (openWoCount > 0) {
      throw new DomainException(
        `Cannot decommission asset — ${openWoCount} open work order(s) exist`,
        'ASSET_HAS_OPEN_WO',
        409,
      )
    }

    await this.db.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await this.writeAudit({ ...audit, action: 'DELETE_ASSET', entityId: id, before: existing })
  }

  async getWorkOrders(id: string, page = 1, limit = 20): Promise<Paginated<unknown>> {
    const exists = await this.db.asset.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
    if (!exists) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

    const skip = (page - 1) * limit
    const where = { assetId: id, deletedAt: null }

    const [data, total] = await Promise.all([
      this.db.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, woNumber: true, title: true, type: true, priority: true,
          status: true, createdAt: true, completedAt: true, totalLaborCost: true, totalPartsCost: true,
        },
      }),
      this.db.workOrder.count({ where }),
    ])

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getMetrics(id: string): Promise<unknown> {
    const exists = await this.db.asset.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
    if (!exists) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

    // MTBF / MTTR: use completed corrective work orders
    const completedCorrective = await this.db.workOrder.findMany({
      where: {
        assetId: id,
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        deletedAt: null,
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true, createdAt: true },
      orderBy: { completedAt: 'asc' },
    })

    // MTTR: mean time to repair (average repair duration in hours)
    let mttrHours = 0
    if (completedCorrective.length > 0) {
      const totalRepairMs = completedCorrective.reduce((sum, wo) => {
        const started = wo.startedAt?.getTime() ?? wo.createdAt.getTime()
        const completed = wo.completedAt?.getTime() ?? started
        return sum + (completed - started)
      }, 0)
      mttrHours = totalRepairMs / completedCorrective.length / 3_600_000
    }

    // MTBF: mean time between failures
    let mtbfHours = 0
    if (completedCorrective.length > 1) {
      const firstFailure = completedCorrective[0]?.createdAt.getTime() ?? 0
      const lastFailure = completedCorrective[completedCorrective.length - 1]?.createdAt.getTime() ?? 0
      const spanMs = lastFailure - firstFailure
      mtbfHours = spanMs / (completedCorrective.length - 1) / 3_600_000
    }

    // Total cost
    const costAgg = await this.db.workOrder.aggregate({
      where: { assetId: id, deletedAt: null },
      // eslint-disable-next-line no-underscore-dangle
      _sum: { totalLaborCost: true, totalPartsCost: true },
    })

    // eslint-disable-next-line no-underscore-dangle
    const sums = costAgg._sum

    const openWoCount = await this.db.workOrder.count({
      where: { assetId: id, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    })

    return {
      mtbfHours: Math.round(mtbfHours * 10) / 10,
      mttrHours: Math.round(mttrHours * 10) / 10,
      failureCount: completedCorrective.length,
      openWorkOrders: openWoCount,
      totalCost: {
        labor: sums.totalLaborCost ?? 0,
        parts: sums.totalPartsCost ?? 0,
      },
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async writeAudit(opts: {
    userId: string
    action: string
    entityId: string
    before?: unknown
    after?: unknown
    ipAddress: string | null
    userAgent: string | null
  }): Promise<void> {
    await this.db.auditLog.create({
      data: {
        tenantId: this.tenantId,
        userId: opts.userId,
        action: opts.action,
        entityType: 'Asset',
        entityId: opts.entityId,
        ...(opts.before !== undefined && { before: opts.before as Prisma.InputJsonValue }),
        ...(opts.after !== undefined && { after: opts.after as Prisma.InputJsonValue }),
        ...(opts.ipAddress !== null && { ipAddress: opts.ipAddress }),
        ...(opts.userAgent !== null && { userAgent: opts.userAgent }),
      },
    })
  }
}
