/**
 * GetPMCalendarHandler
 *
 * Returns all PM schedules whose `nextDue` falls within [from, to],
 * grouped by calendar date.  Designed to power the monthly/weekly calendar
 * view in the front-end.
 *
 * Assignees are loaded in a single batch query (no N+1).
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  PMCalendarDay,
  PMCalendarEntry,
  PMCalendarResult,
  UserAvatarStub,
} from './query.types.js'

// โ”€โ”€ Query โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export interface GetPMCalendarQuery {
  from: Date
  to: Date
}

// โ”€โ”€ Raw JSON โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

interface RawCalendarMeta {
  pmMeta?: { advanceNoticeDays?: number; defaultAssigneeIds?: string[] }
}

// โ”€โ”€ Handler โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class GetPMCalendarHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handle(query: GetPMCalendarQuery, _ctx: QueryContext): Promise<PMCalendarResult> {
    const now = new Date()

    // โ”€โ”€ 1. Fetch PM schedules in date range โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const rows = await this.db.pMSchedule.findMany({
      where: {
        isActive: true,
        nextDue: { gte: query.from, lte: query.to },
      },
      select: {
        id: true,
        title: true,
        triggerType: true,
        estimatedHours: true,
        nextDue: true,
        calendarRule: true,
        meterRule: true,
        assetId: true,
        asset: {
          select: { id: true, assetNumber: true, name: true },
        },
      },
      orderBy: { nextDue: 'asc' },
    })

    // โ”€โ”€ 2. Batch-load all unique assignee IDs โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const assigneeIdSet = new Set<string>()
    for (const r of rows) {
      const cal = r.calendarRule as RawCalendarMeta | null
      const met = r.meterRule as RawCalendarMeta | null
      const ids = cal?.pmMeta?.defaultAssigneeIds ?? met?.pmMeta?.defaultAssigneeIds ?? []
      ;(ids as string[]).forEach((id) => assigneeIdSet.add(id))
    }

    const allAssigneeIds = [...assigneeIdSet]
    const userRows =
      allAssigneeIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: allAssigneeIds } },
            select: { id: true, name: true, avatarUrl: true },
          })
        : []

    const userById = new Map(userRows.map((u) => [u.id, u]))

    // โ”€โ”€ 3. Group by calendar date โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const dayMap = new Map<string, PMCalendarEntry[]>()

    for (const r of rows.filter((row) => row.nextDue)) {
      const dateKey = r.nextDue!.toISOString().slice(0, 10)

      const cal = r.calendarRule as RawCalendarMeta | null
      const met = r.meterRule as RawCalendarMeta | null
      const assigneeIds = (cal?.pmMeta?.defaultAssigneeIds ??
        met?.pmMeta?.defaultAssigneeIds ??
        []) as string[]

      const assignees: UserAvatarStub[] = assigneeIds
        .map((uid) => {
          const u = userById.get(uid)
          return u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null } : null
        })
        .filter((u): u is UserAvatarStub => u !== null)

      const entry: PMCalendarEntry = {
        scheduleId: r.id,
        title: r.title,
        assetId: r.assetId,
        assetName: r.asset.name,
        assetNumber: r.asset.assetNumber,
        type: r.triggerType,
        estimatedHours: r.estimatedHours ? Number(r.estimatedHours) : 0,
        isOverdue: r.nextDue! < now,
        assignees,
      }

      const existing = dayMap.get(dateKey) ?? []
      existing.push(entry)
      dayMap.set(dateKey, existing)
    }

    // โ”€โ”€ 4. Build dense day array (all days in range, even empty ones) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const days: PMCalendarDay[] = []
    const cursor = new Date(query.from)

    while (cursor <= query.to) {
      const dateKey = cursor.toISOString().slice(0, 10)
      days.push({
        date: dateKey,
        entries: dayMap.get(dateKey) ?? [],
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return {
      from: query.from.toISOString().slice(0, 10),
      to: query.to.toISOString().slice(0, 10),
      days,
      totalEvents: rows.length,
    }
  }
}
