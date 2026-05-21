/**
 * ManualTriggerPMHandler
 *
 * Allows a manager or technician to manually fire a PM schedule outside of
 * the normal scheduler run.  This creates a PREVENTIVE work order immediately
 * and advances the schedule's lastTriggeredAt / nextDueAt.
 *
 * The work order is created directly via PrismaClient (bypassing the
 * CreateWorkOrderHandler) because:
 *  - We don't need HTTP-layer TenantClient asset validation (we already loaded
 *    the PM schedule, which guarantees the asset exists in this tenant).
 *  - We need access to the draft (tasks, assignees) before the WO is created.
 */
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

const MEDIUM_SLA_HOURS = 24

async function nextWONumber(prisma: PrismaClient, tenantId: string): Promise<string> {
  const last = await prisma.workOrder.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { woNumber: true },
  })
  const lastNum = last?.woNumber ? Number(last.woNumber.replace(/\D/g, '')) || 0 : 0
  return `WO-${String(lastNum + 1).padStart(6, '0')}`
}

// ── Command ───────────────────────────────────────────────────────────────────

export interface ManualTriggerPMCommand {
  id: string
  /** Override assignees — defaults to schedule.defaultAssigneeIds. */
  assigneeIds?: string[]
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface ManualTriggerPMResult {
  workOrderId: string
  woNumber: string
  nextDueAt: string | null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class ManualTriggerPMHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: ManualTriggerPMCommand, ctx: CommandContext): Promise<ManualTriggerPMResult> {
    // ── 1. Load aggregate ────────────────────────────────────────────────────
    const id = new PMScheduleId(cmd.id)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    // ── 2. Trigger (advances lastTriggeredAt + nextDueAt) ────────────────────
    schedule.trigger('MANUAL')

    // ── 3. Generate WO draft ─────────────────────────────────────────────────
    const draft = schedule.generateWorkOrderDraft()

    // ── 4. Create work order ─────────────────────────────────────────────────
    const woId = randomUUID()
      .replace(/-/g, '')
      .slice(0, 24)
      .replace(/^[^a-z]/, 'c')
    const woNumber = await nextWONumber(this.prisma, ctx.tenantId)
    const now = new Date()
    const assigneeIds = cmd.assigneeIds ?? draft.assigneeIds

    await this.prisma.workOrder.create({
      data: {
        id: woId,
        tenantId: ctx.tenantId,
        woNumber,
        title: draft.title,
        description: draft.description,
        type: 'PREVENTIVE',
        priority: 'MEDIUM',
        status: 'OPEN',
        assetId: draft.assetId,
        assigneeIds,
        slaDeadline: new Date(now.getTime() + MEDIUM_SLA_HOURS * 3_600_000),
        createdById: ctx.executingUserId,
        createdAt: now,
        updatedAt: now,
      },
    })

    // ── 5. Save updated schedule ─────────────────────────────────────────────
    await this.pmRepo.update(schedule)

    // ── 6. Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'MANUAL_TRIGGER_PM',
      entityType: 'PMSchedule',
      entityId: cmd.id,
      after: {
        woId,
        woNumber,
        triggeredBy: 'MANUAL',
        triggeredAt: now.toISOString(),
        nextDueAt: schedule.nextDueAt?.toISOString() ?? null,
        pmScheduleId: cmd.id,
        source: 'manual',
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      workOrderId: woId,
      woNumber,
      nextDueAt: schedule.nextDueAt?.toISOString() ?? null,
    }
  }
}
