/**
 * GetWorkOrderCalendarHandler — WOs grouped by date for calendar views.
 *
 * For each day in [from, to]:
 *   - workOrders: WOs whose dueDate falls on that date
 *   - pmDue:      PM schedules whose nextDue falls on that date
 *
 * Date matching uses the local calendar date (YYYY-MM-DD) ignoring time.
 * The query loads all matching rows for the date range in two queries, then
 * groups them in memory — this avoids N+1 per-day queries.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  WorkOrderCalendar,
  CalendarDayEntry,
  CalendarWorkOrder,
  PMDueEntry,
} from './query.types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetWorkOrderCalendarQuery {
  /** Inclusive start date (YYYY-MM-DD). */
  from: string
  /** Inclusive end date (YYYY-MM-DD). Max 92 days (one quarter). */
  to: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetWorkOrderCalendarHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  async handle(query: GetWorkOrderCalendarQuery, ctx: QueryContext): Promise<WorkOrderCalendar> {
    const fromDate = new Date(`${query.from}T00:00:00.000Z`)
    const toDate = new Date(`${query.to}T23:59:59.999Z`)

    // ── Fetch WOs with dueDate in range ───────────────────────────────────────
    const [woRows, pmRows] = await Promise.all([
      this.db.workOrder.findMany({
        where: {
          deletedAt: null,
          dueDate: { gte: fromDate, lte: toDate },
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          id: true,
          woNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          assetId: true,
          dueDate: true,
          asset: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),

      // PM schedules with nextDue in range
      this.prisma.pMSchedule.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          nextDue: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          title: true,
          assetId: true,
          nextDue: true,
          asset: { select: { id: true, name: true } },
        },
        orderBy: { nextDue: 'asc' },
      }),
    ])

    // ── Build day-keyed maps ──────────────────────────────────────────────────
    const woByDay = new Map<string, CalendarWorkOrder[]>()
    const pmByDay = new Map<string, PMDueEntry[]>()

    for (const r of woRows) {
      if (r.dueDate) {
        const dayKey = toDateKey(r.dueDate)
        const existing = woByDay.get(dayKey) ?? []
        existing.push({
          id: r.id,
          woNumber: r.woNumber,
          title: r.title,
          type: r.type,
          priority: r.priority,
          status: r.status,
          assetId: r.assetId,
          assetName: r.asset.name,
        })
        woByDay.set(dayKey, existing)
      }
    }

    for (const p of pmRows) {
      if (p.nextDue) {
        const dayKey = toDateKey(p.nextDue)
        const existing = pmByDay.get(dayKey) ?? []
        existing.push({
          scheduleId: p.id,
          title: p.title,
          assetId: p.assetId,
          assetName: p.asset.name,
        })
        pmByDay.set(dayKey, existing)
      }
    }

    // ── Build day entries for every date in range ─────────────────────────────
    const days: CalendarDayEntry[] = []
    const cursor = new Date(fromDate)

    while (cursor <= toDate) {
      const dayKey = toDateKey(cursor)
      const woList = woByDay.get(dayKey) ?? []
      const pmList = pmByDay.get(dayKey) ?? []

      // Include day only when it has content
      if (woList.length > 0 || pmList.length > 0) {
        days.push({ date: dayKey, workOrders: woList, pmDue: pmList })
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return { from: query.from, to: query.to, days }
  }
}
