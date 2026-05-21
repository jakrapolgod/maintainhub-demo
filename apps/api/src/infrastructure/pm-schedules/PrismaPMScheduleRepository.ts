/**
 * PrismaPMScheduleRepository โ€” Prisma implementation of the PMScheduleRepository port.
 *
 * ## findDueForTrigger
 * Returns schedules where:
 *   isActive = true  AND
 *   (nextDue IS NULL  OR  nextDue - advanceNoticeDays <= now)
 *   AND tenantId IN (provided tenant list OR all active tenants when called cross-tenant)
 *
 * `advanceNoticeDays` lives inside the calendarRule JSON blob (pmMeta.advanceNoticeDays).
 * We cannot filter by it at the SQL level without a generated column, so we fetch
 * candidate rows (nextDue <= now + MAX_ADVANCE_DAYS) and let the domain layer do the
 * fine-grained shouldTrigger() check.  MAX_ADVANCE_DAYS = 30 is generous enough to
 * catch all advance-notice scenarios while keeping the result set small.
 */
import type { PrismaClient } from '@prisma/client'
import type { PMSchedule, PMScheduleRepository, PMScheduleId } from '@maintainhub/domain'
import { PMScheduleMapper } from './PMScheduleMapper.js'

/** Upper bound for the SQL pre-filter.  The domain shouldTrigger() does the exact check. */
const MAX_ADVANCE_DAYS = 30

export class PrismaPMScheduleRepository implements PMScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // โ”€โ”€ Save โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async save(schedule: PMSchedule): Promise<void> {
    await this.prisma.pMSchedule.create({
      data: PMScheduleMapper.toCreateInput(schedule),
    })
  }

  // โ”€โ”€ Update โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async update(schedule: PMSchedule): Promise<void> {
    await this.prisma.pMSchedule.update({
      where: { id: schedule.id.value },
      data: PMScheduleMapper.toUpdateInput(schedule),
    })
  }

  // โ”€โ”€ FindById โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async findById(id: PMScheduleId, tenantId: string): Promise<PMSchedule | undefined> {
    const row = await this.prisma.pMSchedule.findFirst({
      where: { id: id.value, tenantId },
    })
    return row !== null ? PMScheduleMapper.toDomain(row) : undefined
  }

  // โ”€โ”€ Delete (soft โ€” sets isActive=false rather than hard-deleting) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async delete(id: PMScheduleId, tenantId: string): Promise<void> {
    await this.prisma.pMSchedule.updateMany({
      where: { id: id.value, tenantId },
      data: { isActive: false },
    })
  }

  // โ”€โ”€ findDueForTrigger โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  /**
   * Cross-tenant query โ€” called by the background scheduler worker, not by an
   * HTTP handler.  Returns every active schedule whose nextDue is within the
   * generous SQL pre-filter window; the caller must invoke `shouldTrigger()`
   * for the precise domain-level check.
   *
   * @param now  - Current time (passed in so tests can control the clock)
   * @param tenantId - Optional; when omitted, queries across ALL active tenants
   */
  async findDueForTrigger(now: Date, tenantId?: string): Promise<PMSchedule[]> {
    const cutoff = new Date(now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000)

    const rows = await this.prisma.pMSchedule.findMany({
      where: {
        isActive: true,
        ...(tenantId !== undefined ? { tenantId } : { tenant: { isActive: true } }),
        OR: [{ nextDue: null }, { nextDue: { lte: cutoff } }],
      },
      orderBy: { nextDue: 'asc' },
    })

    return rows.map((r) => PMScheduleMapper.toDomain(r))
  }

  // โ”€โ”€ findByAsset โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async findByAsset(assetId: string, tenantId: string): Promise<PMSchedule[]> {
    const rows = await this.prisma.pMSchedule.findMany({
      where: { assetId, tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => PMScheduleMapper.toDomain(r))
  }
}
