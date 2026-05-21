import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { LaborCost, Money, WorkOrderId } from '@maintainhub/domain'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface AddLaborCommand {
  workOrderId: string
  /** Hours worked — must be > 0. */
  hours: number
  /** Hourly rate in the tenant's base currency — must be > 0. */
  ratePerHour: number
  date: Date
  description?: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class AddLaborHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Logs a labour time entry against a work order.
   *
   * Application-layer validations (pre-domain):
   *   - hours must be > 0
   *   - ratePerHour must be > 0
   *   - date must not be in the future
   *
   * Domain rule enforced by `wo.addLabor()`:
   *   - Work order must be IN_PROGRESS
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException INVALID_HOURS
   * @throws DomainException INVALID_RATE
   * @throws DomainException INVALID_DATE
   * @throws DomainException INVALID_LABOR_ADD — WO not IN_PROGRESS
   */
  async handle(cmd: AddLaborCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Application-layer input validation ──────────────────────────────────
    if (!Number.isFinite(cmd.hours) || cmd.hours <= 0) {
      throw new DomainException('Hours must be a positive number', 'INVALID_HOURS', 422)
    }
    if (!Number.isFinite(cmd.ratePerHour) || cmd.ratePerHour <= 0) {
      throw new DomainException('Rate per hour must be a positive number', 'INVALID_RATE', 422)
    }

    // Date cannot be in the future (compare date parts, ignore time)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const laborDate = new Date(cmd.date)
    laborDate.setHours(0, 0, 0, 0)
    if (laborDate > todayStart) {
      throw new DomainException('Labour date cannot be in the future', 'INVALID_DATE', 422)
    }

    // ── 2. Load aggregate to validate WO status ───────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 3. Build domain value objects and call domain validation ──────────────
    const rate = new Money(cmd.ratePerHour, 'THB')
    const cost = new LaborCost(cmd.hours, rate)
    const entryId = randomUUID()

    wo.addLabor({
      id: entryId,
      technicianId: ctx.executingUserId,
      date: cmd.date,
      cost,
      description: cmd.description,
    })

    // ── 4. Persist LaborEntry row (repo.save() does not persist relations) ────
    const hours = new Prisma.Decimal(cmd.hours)
    const rateDecimal = new Prisma.Decimal(cmd.ratePerHour)
    const totalCost = hours.mul(rateDecimal)

    await this.prisma.laborEntry.create({
      data: {
        id: entryId,
        workOrderId: cmd.workOrderId,
        technicianId: ctx.executingUserId,
        date: cmd.date,
        hours,
        ratePerHour: rateDecimal,
        totalCost,
        ...(cmd.description !== undefined && { description: cmd.description }),
      },
    })

    // ── 5. Update denormalised labor total on the WO ──────────────────────────
    await this.recalculateLaborTotal(cmd.workOrderId)

    // ── 6. Save aggregate (updates updatedAt, dispatches any queued events) ───
    await this.woRepo.save(wo)

    // ── 7. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'ADD_LABOR_ENTRY',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      after: {
        entryId,
        hours: cmd.hours,
        ratePerHour: cmd.ratePerHour,
        date: cmd.date.toISOString(),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return entryId
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async recalculateLaborTotal(woId: string): Promise<void> {
    const usages = await this.prisma.laborEntry.findMany({
      where: { workOrderId: woId },
      select: { totalCost: true },
    })
    const total = usages.reduce(
      (sum, e) => sum.add(new Prisma.Decimal(e.totalCost.toString())),
      new Prisma.Decimal(0),
    )
    await this.prisma.workOrder.update({
      where: { id: woId },
      data: { totalLaborCost: total },
    })
  }
}
