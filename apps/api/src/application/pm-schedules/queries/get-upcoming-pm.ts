/**
 * GetUpcomingPMHandler
 *
 * Returns active PM schedules due within a configurable horizon (30/60/90 days),
 * sorted by nextDueAt, grouped by ISO week.  Overdue items appear in a separate
 * `overdueItems` list.
 *
 * ## ISO week label
 * "2024-W23" โ€” standard ISO 8601 week notation (Monday-anchored).
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  UpcomingPMItem,
  UpcomingPMWeek,
  UpcomingPMResult,
  UserAvatarStub,
} from './query.types.js'

// โ”€โ”€ Query โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export interface GetUpcomingPMQuery {
  /** Days to look ahead. @default 30 */
  horizon?: 30 | 60 | 90
}

// โ”€โ”€ ISO week helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7 // make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum) // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function weekBoundaries(weekLabel: string): { weekStart: string; weekEnd: string } {
  const [yearStr, weekStr] = weekLabel.split('-W')
  const year = Number(yearStr)
  const week = Number(weekStr)
  // Find Monday of that ISO week
  const jan4 = new Date(Date.UTC(year, 0, 4)) // Jan 4 is always in W01
  const w1Mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000)
  const wMon = new Date(w1Mon.getTime() + (week - 1) * 7 * 86_400_000)
  const wSun = new Date(wMon.getTime() + 6 * 86_400_000)
  return {
    weekStart: wMon.toISOString().slice(0, 10),
    weekEnd: wSun.toISOString().slice(0, 10),
  }
}

// โ”€โ”€ Raw JSON โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

interface RawMeta {
  pmMeta?: { advanceNoticeDays?: number; defaultAssigneeIds?: string[] }
}

// โ”€โ”€ Handler โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class GetUpcomingPMHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handle(query: GetUpcomingPMQuery, _ctx: QueryContext): Promise<UpcomingPMResult> {
    const horizon = query.horizon ?? 30
    const now = new Date()
    const cutoff = new Date(now.getTime() + horizon * 86_400_000)

    // โ”€โ”€ 1. Fetch (includes overdue: nextDue <= now) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const rows = await this.db.pMSchedule.findMany({
      where: {
        isActive: true,
        nextDue: { lte: cutoff },
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
          select: {
            id: true,
            assetNumber: true,
            name: true,
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { nextDue: 'asc' },
    })

    // โ”€โ”€ 2. Batch-load assignees โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const assigneeIdSet = new Set<string>()
    for (const r of rows) {
      const cal = r.calendarRule as RawMeta | null
      const met = r.meterRule as RawMeta | null
      ;(
        (cal?.pmMeta?.defaultAssigneeIds ?? met?.pmMeta?.defaultAssigneeIds ?? []) as string[]
      ).forEach((id) => assigneeIdSet.add(id))
    }

    const userById = new Map<string, UserAvatarStub>()
    if (assigneeIdSet.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...assigneeIdSet] } },
        select: { id: true, name: true, avatarUrl: true },
      })
      for (const u of users) {
        userById.set(u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null })
      }
    }

    // โ”€โ”€ 3. Build item list โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const overdueItems: UpcomingPMItem[] = []
    const weekMap = new Map<string, UpcomingPMItem[]>()

    for (const r of rows.filter((row) => row.nextDue)) {
      const cal = r.calendarRule as RawMeta | null
      const met = r.meterRule as RawMeta | null
      const assigneeIds = (cal?.pmMeta?.defaultAssigneeIds ??
        met?.pmMeta?.defaultAssigneeIds ??
        []) as string[]

      const assignees = assigneeIds
        .map((id) => userById.get(id))
        .filter((u): u is UserAvatarStub => u !== undefined)

      const msUntilDue = r.nextDue!.getTime() - now.getTime()
      const daysUntilDue = Math.round(msUntilDue / 86_400_000)

      const item: UpcomingPMItem = {
        scheduleId: r.id,
        title: r.title,
        assetId: r.assetId,
        assetName: r.asset.name,
        assetNumber: r.asset.assetNumber,
        locationName: r.asset.location?.name ?? null,
        type: r.triggerType,
        estimatedHours: r.estimatedHours ? Number(r.estimatedHours) : 0,
        nextDueAt: r.nextDue!.toISOString(),
        daysUntilDue,
        isOverdue: daysUntilDue < 0,
        assignees,
      }

      if (item.isOverdue) {
        overdueItems.push(item)
      } else {
        const weekLabel = isoWeekLabel(r.nextDue!)
        const existing = weekMap.get(weekLabel) ?? []
        existing.push(item)
        weekMap.set(weekLabel, existing)
      }
    }

    // โ”€โ”€ 4. Build week groups โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const weeks: UpcomingPMWeek[] = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekLabel, items]) => {
        const { weekStart, weekEnd } = weekBoundaries(weekLabel)
        const totalEstimatedHours = items.reduce((s, i) => s + i.estimatedHours, 0)
        return { weekLabel, weekStart, weekEnd, items, totalEstimatedHours }
      })

    return {
      horizon,
      weeks,
      overdueItems,
      totalItems: rows.length,
    }
  }
}
