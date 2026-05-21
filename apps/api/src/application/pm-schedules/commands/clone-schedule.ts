/**
 * CloneScheduleHandler
 *
 * Copies a PM schedule to a different asset, carrying over the full task list,
 * calendarRule/meterRule, and metadata.  The clone starts fresh:
 *   - lastTriggeredAt  → undefined
 *   - nextDueAt        → recomputed from `now` (for CALENDAR type)
 *   - isActive         → false (caller activates explicitly after review)
 */
import type { PrismaClient } from '@prisma/client'
import { PMSchedule, PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generatePMId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CloneScheduleCommand {
  sourceId: string
  targetAssetId: string
  /** Override title; defaults to "{original title} (Copy)" */
  title?: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CloneScheduleHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: CloneScheduleCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Load source schedule ───────────────────────────────────────────────
    const sourceId = new PMScheduleId(cmd.sourceId)
    const source = await this.pmRepo.findById(sourceId, ctx.tenantId)
    if (source === undefined) {
      throw new DomainException('Source PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    // ── 2. Validate target asset ──────────────────────────────────────────────
    const targetAsset = await this.db.asset.findFirst({
      where: { id: cmd.targetAssetId, deletedAt: null },
      select: { id: true },
    })
    if (!targetAsset) {
      throw new DomainException('Target asset not found', 'ASSET_NOT_FOUND', 404)
    }

    // ── 3. Build clone aggregate ──────────────────────────────────────────────
    const newId = new PMScheduleId(generatePMId())

    const clone = PMSchedule.create({
      id: newId,
      tenantId: ctx.tenantId,
      assetId: cmd.targetAssetId,
      type: source.type,
      title: cmd.title ?? `${source.title} (Copy)`,
      description: source.description,
      calendarRule: source.calendarRule,
      meterRule: source.meterRule,
      conditionRule: source.conditionRule,
      // Copy task list — Task is immutable so sharing the same instances is safe
      taskList: [...source.taskList],
      estimatedHours: source.estimatedHours,
      requiredParts: [...source.requiredParts],
      requiredSkillIds: [...source.requiredSkillIds],
      defaultAssigneeIds: [...source.defaultAssigneeIds],
      isActive: false, // starts inactive — activate after review
      advanceNoticeDays: source.advanceNoticeDays,
      createdById: ctx.executingUserId,
    })

    // ── 4. Persist ────────────────────────────────────────────────────────────
    await this.pmRepo.save(clone)

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CLONE_PM_SCHEDULE',
      entityType: 'PMSchedule',
      entityId: newId.value,
      after: {
        clonedFrom: cmd.sourceId,
        targetAssetId: cmd.targetAssetId,
        title: clone.title,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return newId.value
  }
}
