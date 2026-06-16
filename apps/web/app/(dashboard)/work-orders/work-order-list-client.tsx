'use client'

/**
 * WorkOrderListClient — interactive list with three views.
 *
 * Views: Table | Kanban | Calendar
 * Features:
 *   - Status pill filters (multi-select toggle)
 *   - Priority dropdown
 *   - Date range (from/to) inputs
 *   - Full-text search
 *   - Infinite scroll in table / kanban views
 *   - "New Work Order" button → right-drawer AI chat panel
 */
import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, isAfter } from 'date-fns'
import { formatThaiDate, formatThaiDateShort } from '@/lib/formatThaiDate'
import {
  Plus,
  LayoutList,
  Kanban,
  CalendarDays,
  Search,
  SlidersHorizontal,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, PriorityBadge } from '@/components/work-orders/wo-badges'
import { AssigneeAvatars } from '@/components/work-orders/assignee-avatars'

import {
  useWorkOrders,
  useWorkOrdersInfinite,
  useWorkOrderCalendar,
  useStartWorkOrder,
  useCompleteWorkOrder,
  useCancelWorkOrder,
} from '@/hooks/useWorkOrders'
import { AIDraftDrawer } from './ai-draft-drawer'

import type {
  WOStatus,
  WOPriority,
  WorkOrderSummary,
  WorkOrderListResult,
  ListWorkOrdersFilters,
} from '@/lib/api/work-orders'

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_STATUSES: WOStatus[] = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]
const KANBAN_STATUSES: WOStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

const STATUS_LABELS: Record<WOStatus, string> = {
  DRAFT: 'ร่าง',
  OPEN: 'เปิด',
  IN_PROGRESS: 'กำลังดำเนินการ',
  ON_HOLD: 'ระงับชั่วคราว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
}

type View = 'table' | 'kanban' | 'calendar'

// ── Main component ────────────────────────────────────────────────────────────

export function WorkOrderListClient() {
  const router = useRouter()
  const [view, setView] = useState<View>('table')

  const [mounted, setMounted] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<WOStatus[]>([])
  const [priorityFilter, setPriorityFilter] = useState<WOPriority | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300)
    return () => clearTimeout(t)
  }, [])

  const filters: ListWorkOrdersFilters = {
    ...(search && { search }),
    ...(statusFilter.length && { status: statusFilter }),
    ...(priorityFilter !== 'all' && { priority: [priorityFilter] }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
    limit: 20,
  }

  function toggleStatus(s: WOStatus) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  if (!mounted) return <TableSkeleton />

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-background px-6 py-3 space-y-3">
        {/* Row 1: search + view toggle + new button */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาใบสั่งงาน…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center rounded-md border bg-background p-1 gap-0.5">
            {(
              [
                ['table', LayoutList],
                ['kanban', Kanban],
                ['calendar', CalendarDays],
              ] as const
            ).map(([v, Icon]) => (
              <Button
                key={v}
                variant={view === v ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setView(v)}
                title={v.charAt(0).toUpperCase() + v.slice(1)}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          <Button onClick={() => setAiDrawerOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            สร้างใบสั่งงาน
          </Button>
        </div>

        {/* Row 2: status pills + priority + date range */}
        <div className="flex items-center gap-2 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter.includes(s)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />

            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as WOPriority | 'all')}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="ความเร่งด่วน" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกความเร่งด่วน</SelectItem>
                {(
                  [
                    ['CRITICAL', 'วิกฤต'],
                    ['HIGH', 'สูง'],
                    ['MEDIUM', 'ปานกลาง'],
                    ['LOW', 'ต่ำ'],
                  ] as [WOPriority, string][]
                ).map(([p, label]) => (
                  <SelectItem key={p} value={p}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36 text-xs"
              title="วันที่เริ่มต้น"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36 text-xs"
              title="วันที่สิ้นสุด"
            />

            {(statusFilter.length > 0 || priorityFilter !== 'all' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setStatusFilter([])
                  setPriorityFilter('all')
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                ล้างค่า
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── View content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {view === 'table' && (
          <TableView filters={filters} onOpen={(id) => router.push(`/work-orders/${id}`)} />
        )}
        {view === 'kanban' && (
          <KanbanView filters={filters} onOpen={(id) => router.push(`/work-orders/${id}`)} />
        )}
        {view === 'calendar' && <CalendarView />}
      </div>

      {/* ── AI draft drawer ───────────────────────────────────────────────── */}
      <AIDraftDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  )
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({
  filters,
  onOpen,
}: {
  filters: ListWorkOrdersFilters
  onOpen: (id: string) => void
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useWorkOrdersInfinite(filters)

  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '120px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = data?.pages.flatMap((p: WorkOrderListResult) => p.items) ?? []
  const total = (data?.pages[0] as WorkOrderListResult | undefined)?.total ?? 0

  if (isPending) return <TableSkeleton />

  return (
    <div className="p-6">
      <p className="mb-3 text-xs text-muted-foreground">{total} ใบสั่งงาน</p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {[
                'เลขที่ WO',
                'หัวข้อ',
                'สินทรัพย์',
                'ความเร่งด่วน',
                'สถานะ',
                'ผู้รับผิดชอบ',
                'วันกำหนดเสร็จ',
                '',
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((wo: WorkOrderSummary) => (
              <WorkOrderRow key={wo.id} wo={wo} onClick={() => onOpen(wo.id)} />
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                  ไม่มีใบสั่งงานที่ตรงกับตัวกรอง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="mt-4 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  )
}

function WorkOrderRow({ wo, onClick }: { wo: WorkOrderSummary; onClick: () => void }) {
  const isOverdue = wo.slaDeadline
    ? isAfter(new Date(), new Date(wo.slaDeadline)) &&
      wo.status !== 'COMPLETED' &&
      wo.status !== 'CANCELLED'
    : false

  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{wo.woNumber}</td>
      <td className="px-4 py-3 max-w-[220px]">
        <span className="font-medium line-clamp-1">{wo.title}</span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground line-clamp-1">{wo.assetName}</td>
      <td className="px-4 py-3">
        <PriorityBadge priority={wo.priority} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={wo.status} />
      </td>
      <td className="px-4 py-3">
        <AssigneeAvatars assignees={wo.assignees} />
      </td>
      <td
        className={`px-4 py-3 text-xs whitespace-nowrap ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
      >
        {wo.dueDate ? `${isOverdue ? '⚠ ' : ''}${formatThaiDate(wo.dueDate)}` : '—'}
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/work-orders/${wo.id}`}
          className="text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          ดู
        </Link>
      </td>
    </tr>
  )
}

function TableSkeleton() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ── Kanban view ───────────────────────────────────────────────────────────────

function KanbanView({
  filters,
  onOpen,
}: {
  filters: ListWorkOrdersFilters
  onOpen: (id: string) => void
}) {
  const { data, isPending } = useWorkOrders({ ...filters, limit: 100 })
  const items = data?.items ?? []

  if (isPending)
    return (
      <div className="flex gap-4 p-6 overflow-x-auto">
        {KANBAN_STATUSES.map((s) => (
          <Skeleton key={s} className="h-96 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    )

  const byStatus = KANBAN_STATUSES.reduce<Record<WOStatus, WorkOrderSummary[]>>(
    (acc, s) => {
      acc[s] = items.filter((w) => w.status === s)
      return acc
    },
    {} as Record<WOStatus, WorkOrderSummary[]>,
  )

  return (
    <div className="flex gap-4 p-6 overflow-x-auto h-full">
      {KANBAN_STATUSES.map((status) => {
        const col = byStatus[status] ?? []
        return (
          <div key={status} className="flex shrink-0 flex-col w-72">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
                <span className="text-xs text-muted-foreground">{col.length}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto rounded-xl bg-muted/40 p-2 min-h-[120px]">
              {col.map((wo) => (
                <KanbanCard key={wo.id} wo={wo} onClick={() => onOpen(wo.id)} />
              ))}
              {col.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">ไม่มีรายการ</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({ wo, onClick }: { wo: WorkOrderSummary; onClick: () => void }) {
  const isOverdue = wo.slaDeadline
    ? isAfter(new Date(), new Date(wo.slaDeadline)) &&
      wo.status !== 'COMPLETED' &&
      wo.status !== 'CANCELLED'
    : false

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${isOverdue ? 'ring-1 ring-destructive/50' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-sm line-clamp-2 flex-1">{wo.title}</span>
          <PriorityBadge priority={wo.priority} />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{wo.assetName}</p>
        <div className="flex items-center justify-between">
          <AssigneeAvatars assignees={wo.assignees} max={2} size="sm" />
          {wo.dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {formatThaiDateShort(wo.dueDate)}
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-muted-foreground">{wo.woNumber}</p>
      </CardContent>
    </Card>
  )
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { data, isPending } = useWorkOrderCalendar(year, month)

  if (isPending)
    return (
      <div className="p-6 grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    )

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = new Date(year, month - 1, 1).getDay()

  type CalDay = NonNullable<typeof data>['days'][number]
  const byDate = (data?.days ?? []).reduce<Record<string, CalDay>>((acc, d) => {
    acc[d.date] = d
    return acc
  }, {})

  return (
    <div className="p-6">
      <h2 className="mb-4 text-lg font-semibold">
        {new Date(year, month - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
      </h2>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const entry = byDate[dateKey]
          const isToday = dateKey === format(now, 'yyyy-MM-dd')

          return (
            <div
              key={day}
              className={`min-h-[80px] rounded-lg border p-1.5 text-xs ${
                isToday ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
            >
              <div className={`font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>{day}</div>
              {entry?.workOrders.slice(0, 3).map((wo) => (
                <Link
                  key={wo.id}
                  href={`/work-orders/${wo.id}`}
                  className="block truncate rounded px-1 py-0.5 mb-0.5 text-[10px] hover:bg-primary/10 text-foreground"
                >
                  {wo.woNumber} · {wo.title}
                </Link>
              ))}
              {(entry?.workOrders.length ?? 0) > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{(entry?.workOrders.length ?? 0) - 3} เพิ่มเติม
                </span>
              )}
              {(entry?.pmDue ?? []).slice(0, 2).map((pm) => (
                <div
                  key={pm.scheduleId}
                  className="truncate rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-800 mb-0.5"
                >
                  PM: {pm.title}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
