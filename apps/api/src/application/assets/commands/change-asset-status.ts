import type { PrismaClient } from '@prisma/client'
import { AssetId, AssetStatus, Priority } from '@maintainhub/domain'
import type { AssetRepository, WOType } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generateAssetId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface ChangeAssetStatusCommand {
  assetId: string
  /** Target status value — must be a valid AssetStatus string. */
  newStatus: string
  /** Human-readable reason for the change (stored in AuditLog). */
  reason?: string
  /**
   * When transitioning to UNDER_MAINTENANCE, optionally create a linked
   * CORRECTIVE work order so the repair can be tracked.
   */
  linkedWorkOrder?: {
    title: string
    type?: WOType
    priority?: string
    description?: string
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class ChangeAssetStatusHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Transition an asset to a new status.
   *
   * Domain rules enforced by `asset.changeStatus()`:
   *   - Valid transition table: OPERATIONAL ↔ STANDBY ↔ UNDER_MAINTENANCE;
   *     DECOMMISSIONED is terminal (use DecommissionAssetHandler instead).
   *
   * Side effects:
   *   - Emits `AssetStatusChangedEvent` via repository
   *   - When status → UNDER_MAINTENANCE and `linkedWorkOrder` is provided,
   *     creates a linked CORRECTIVE work order in DRAFT status.
   *   - Writes AuditLog
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException INVALID_ASSET_STATUS_TRANSITION
   * @throws DomainException USE_DECOMMISSION_HANDLER — attempt to set DECOMMISSIONED
   */
  async handle(cmd: ChangeAssetStatusCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Guard: DECOMMISSIONED must go through DecommissionAssetHandler ──────
    if (cmd.newStatus === 'DECOMMISSIONED') {
      throw new DomainException(
        'Use DecommissionAssetHandler to decommission an asset — it enforces additional safety checks',
        'USE_DECOMMISSION_HANDLER',
        422,
      )
    }

    // ── 2. Load aggregate ──────────────────────────────────────────────────────
    const asset = await this.assetRepo.findById(new AssetId(cmd.assetId), ctx.tenantId)
    if (!asset) {
      throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    }

    const previousStatus = asset.status.value

    // ── 3. Apply domain transition (throws INVALID_ASSET_STATUS_TRANSITION) ───
    const newStatus = AssetStatus.from(cmd.newStatus)
    asset.changeStatus(newStatus, ctx.executingUserId)

    // ── 4. Persist + dispatch AssetStatusChangedEvent ─────────────────────────
    await this.assetRepo.save(asset)

    // ── 5. Optionally create a linked work order when entering maintenance ─────
    if (cmd.newStatus === 'UNDER_MAINTENANCE' && cmd.linkedWorkOrder !== undefined) {
      await this.createLinkedWorkOrder(cmd.assetId, cmd.linkedWorkOrder, ctx)
    }

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CHANGE_ASSET_STATUS',
      entityType: 'Asset',
      entityId: cmd.assetId,
      before: { status: previousStatus },
      after: { status: cmd.newStatus, reason: cmd.reason },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async createLinkedWorkOrder(
    assetId: string,
    wo: NonNullable<ChangeAssetStatusCommand['linkedWorkOrder']>,
    ctx: CommandContext,
  ): Promise<void> {
    const year = new Date().getFullYear()
    const safeTid = ctx.tenantId.replace(/[^a-z0-9]/g, '')
    const seqName = `wo_seq_${safeTid}_${year}`

    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE NO CYCLE`,
    )
    const rows = await this.prisma.$queryRawUnsafe<Array<{ nextval: bigint }>>(
      `SELECT nextval('"${seqName}"')`,
    )
    const seq = Number(rows[0]?.nextval ?? 1)
    const woNumber = `WO-${year}-${String(seq).padStart(6, '0')}`
    const woId = generateAssetId()

    await this.prisma.workOrder.create({
      data: {
        id: woId,
        tenantId: ctx.tenantId,
        woNumber,
        title: wo.title,
        type: (wo.type ?? 'CORRECTIVE') as WOType,
        priority: Priority.from(wo.priority ?? 'MEDIUM').value as never,
        status: 'DRAFT',
        assetId,
        createdById: ctx.executingUserId,
        ...(wo.description !== undefined && { description: wo.description }),
      },
    })

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: woId,
      after: { woNumber, title: wo.title, assetId, linkedToStatusChange: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
