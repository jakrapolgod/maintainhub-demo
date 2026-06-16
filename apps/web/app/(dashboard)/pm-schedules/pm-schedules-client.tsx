'use client'

/**
 * PMSchedulesClient — three-view PM list page.
 *
 * Views: List | Calendar | Compliance
 *
 * List view   — table with overdue colouring + isActive toggles
 * Calendar    — monthly grid with PM event bars coloured by urgency
 * Compliance  — per-schedule compliance % bars
 */

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  parseISO,
  differenceInDays,
  addMonths,
  subMonths,
} from 'date-fns'
import {
  Plus,
  LayoutList,
  CalendarDays,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

import {
  usePMSchedules,
  usePMCalendar,
  usePMCompliance,
  useActivatePMSchedule,
  useDeactivatePMSchedule,
  useTriggerPMSchedule,
} from '@/hooks/usePMSchedules'
import type { PMScheduleDto, PMCalendarEntry } from '@/lib/api/pm-schedules'

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextDueColor(nextDueAt: string | null, isOverdue: boolean): string {
  if (!nextDueAt) return 'text-muted-foreground'
  if (isOverdue) return 'text-red-600 font-medium'
  const days = differenceInDays(parseISO(nextDueAt), new Date())
  if (days <= 7) return 'text-amber-600 font-medium'
  return 'text-foreground'
}

function eventUrgencyClass(entry: PMCalendarEntry): string {
  if (entry.isOverdue) return 'bg-red-100 text-red-800 border-red-300'
  const days = differenceInDays(
    parseISO(entry.assignees.length > 0 ? entry.assignees[0]!.id : new Date().toISOString()),
    new Date(),
  )
  if (days <= 7) return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-blue-100 text-blue-800 border-blue-300'
}

function typeLabel(type: string): string {
  return { CALENDAR: 'ปฏิทิน', METER: 'มิเตอร์', CONDITION: 'เงื่อนไข' }[type] ?? type
}

function typeBadgeVariant(type: string): 'info' | 'warning' | 'secondary' {
  if (type === 'CALENDAR') return 'info'
  if (type === 'METER') return 'warning'
  return 'secondary'
}

function complianceColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct >= 70) return 'text-amber-600'
  return 'text-red-600'
}

// ── Main component ────────────────────────────────────────────────────────────

export function PMSchedulesClient() {
  const router = useRouter()
  const [view, setView] = useState<'list' | 'calendar' | 'compliance'>('list')

  const [mounted, setMounted] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedEntry, setSelectedEntry] = useState<PMCalendarEntry | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // ── List query ──────────────────────────────────────────────────────────────
  const listFilters = useMemo(
    () => ({
      ...(activeFilter === 'active' && { isActive: true }),
      ...(activeFilter === 'inactive' && { isActive: false }),
      limit: 100,
    }),
    [activeFilter],
  )

  const { data: listData, isPending: listPending, refetch } = usePMSchedules(listFilters)

  // ── Calendar query ──────────────────────────────────────────────────────────
  const calFrom = format(startOfMonth(calendarMonth), 'yyyy-MM-dd') + 'T00:00:00.000Z'
  const calTo = format(endOfMonth(calendarMonth), 'yyyy-MM-dd') + 'T23:59:59.000Z'
  const { data: calData, isPending: calPending } = usePMCalendar(
    view === 'calendar' ? calFrom : '',
    view === 'calendar' ? calTo : '',
  )

  // ── Compliance query ────────────────────────────────────────────────────────
  const { data: complianceData, isPending: compPending } = usePMCompliance(12)

  // ── Mutations ───────────────────────────────────────────────────────────────
  const activateMut = useActivatePMSchedule()
  const deactivateMut = useDeactivatePMSchedule()
  const triggerMut = useTriggerPMSchedule()

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300)
    return () => clearTimeout(t)
  }, [])

  function handleToggleActive(schedule: PMScheduleDto) {
    if (schedule.isActive) {
      deactivateMut.mutate(schedule.id)
    } else {
      activateMut.mutate(schedule.id)
    }
  }

  function handleTriggerNow(id: string) {
    triggerMut.mutate(
      { id },
      {
        onSuccess: () => setSheetOpen(false),
      },
    )
  }

  if (!mounted)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b bg-background px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">แผนบำรุงรักษา</h1>
            <p className="text-sm text-muted-foreground">โปรแกรมการบำรุงรักษาเชิงป้องกัน</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button asChild size="sm">
              <Link href="/pm-schedules/new">
                <Plus className="h-4 w-4 mr-1" /> แผนใหม่
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── View toggle + filters ────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0 flex items-center gap-4">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="list">
              <LayoutList className="h-4 w-4 mr-1.5" /> รายการ
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="h-4 w-4 mr-1.5" /> ปฏิทิน
            </TabsTrigger>
            <TabsTrigger value="compliance">
              <BarChart3 className="h-4 w-4 mr-1.5" /> ความสอดคล้อง
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'list' && (
          <Select
            value={activeFilter}
            onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกแผน</SelectItem>
              <SelectItem value="active">ใช้งานเท่านั้น</SelectItem>
              <SelectItem value="inactive">ไม่ใช้งานเท่านั้น</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="p-6">
            {listPending ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (listData?.items.length ?? 0) === 0 ? (
              <EmptyState onNew={() => router.push('/pm-schedules/new')} />
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        หัวข้อ
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        สินทรัพย์
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        ประเภท
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        ครบกำหนดถัดไป
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        เรียกใช้ล่าสุด
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">งาน</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        ใช้งาน
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        การดำเนินการ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData?.items.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/pm-schedules/${s.id}/edit`}
                            className="font-medium hover:underline"
                          >
                            {s.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <Link href={`/assets/${s.assetId}`} className="hover:underline">
                            {s.assetName}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={typeBadgeVariant(s.type)}>{typeLabel(s.type)}</Badge>
                        </td>
                        <td className={`px-4 py-3 ${nextDueColor(s.nextDueAt, s.isOverdue)}`}>
                          {s.nextDueAt ? (
                            format(parseISO(s.nextDueAt), 'dd MMM yyyy')
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {s.isOverdue && (
                            <Badge variant="destructive" className="ml-2 py-0 px-1.5 text-[10px]">
                              เกินกำหนด
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.lastTriggeredAt
                            ? format(parseISO(s.lastTriggeredAt), 'dd MMM yyyy')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.taskCount}</td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={s.isActive}
                            onCheckedChange={() => handleToggleActive(s)}
                            disabled={activateMut.isPending || deactivateMut.isPending}
                            aria-label={s.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!s.isActive || triggerMut.isPending}
                              onClick={() => handleTriggerNow(s.id)}
                              title="Manual trigger"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/pm-schedules/${s.id}/edit`} title="Edit">
                                <span className="sr-only">Edit</span>✎
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── CALENDAR VIEW ─────────────────────────────────────────────────── */}
        {view === 'calendar' && (
          <div className="p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{format(calendarMonth, 'MMMM yyyy')}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date())}>
                  วันนี้
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {calPending ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : (
              <PMCalendarGrid
                month={calendarMonth}
                days={calData?.days ?? []}
                onEntryClick={(entry) => {
                  setSelectedEntry(entry)
                  setSheetOpen(true)
                }}
              />
            )}
          </div>
        )}

        {/* ── COMPLIANCE VIEW ───────────────────────────────────────────────── */}
        {view === 'compliance' && (
          <div className="p-6">
            {compPending ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div
                        className={`text-3xl font-bold ${complianceColor(complianceData?.overallCompliancePct ?? 0)}`}
                      >
                        {complianceData?.overallCompliancePct ?? 0}%
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">ความสอดคล้องรวม</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-3xl font-bold text-green-600">
                        {complianceData?.fullyCompliant ?? 0}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">สอดคล้องครบถ้วน</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-3xl font-bold">
                        {complianceData?.totalSchedules ?? 0}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">แผนทั้งหมด</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Per-schedule compliance table */}
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          แผน
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          สินทรัพย์
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          ประเภท
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          วางแผน
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          จริง
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground min-w-40">
                          ความสอดคล้อง
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(complianceData?.schedules ?? []).map((row) => (
                        <tr
                          key={row.scheduleId}
                          className="border-b last:border-0 hover:bg-muted/20"
                        >
                          <td className="px-4 py-3 font-medium">{row.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.assetName}</td>
                          <td className="px-4 py-3">
                            <Badge variant={typeBadgeVariant(row.type)}>
                              {typeLabel(row.type)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.plannedTriggers}</td>
                          <td className="px-4 py-3">{row.actualTriggers}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Progress value={row.compliancePct} className="h-2 flex-1" />
                              <span
                                className={`text-xs font-medium w-10 text-right ${complianceColor(row.compliancePct)}`}
                              >
                                {row.compliancePct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Schedule detail slide-over ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-96">
          <SheetHeader>
            <SheetTitle>{selectedEntry?.title}</SheetTitle>
            <SheetDescription>
              {selectedEntry?.assetName} · {selectedEntry ? typeLabel(selectedEntry.type) : ''}
            </SheetDescription>
          </SheetHeader>
          {selectedEntry && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">เวลาประมาณ</p>
                  <p className="font-medium">{selectedEntry.estimatedHours} ชม.</p>
                </div>
                <div>
                  <p className="text-muted-foreground">สถานะ</p>
                  <p
                    className={`font-medium ${selectedEntry.isOverdue ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {selectedEntry.isOverdue ? 'เกินกำหนด' : 'ตามกำหนด'}
                  </p>
                </div>
              </div>

              {selectedEntry.assignees.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">มอบหมายให้</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedEntry.assignees.map((a) => (
                      <Badge key={a.id} variant="secondary">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => handleTriggerNow(selectedEntry.scheduleId)}
                disabled={triggerMut.isPending}
              >
                {triggerMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                เรียกใช้ตอนนี้
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link
                  href={`/pm-schedules/${selectedEntry.scheduleId}/edit`}
                  onClick={() => setSheetOpen(false)}
                >
                  แก้ไขแผน
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── PMCalendarGrid ─────────────────────────────────────────────────────────────

interface PMCalendarGridProps {
  month: Date
  days: Array<{ date: string; entries: PMCalendarEntry[] }>
  onEntryClick: (entry: PMCalendarEntry) => void
}

function PMCalendarGrid({ month, days, onEntryClick }: PMCalendarGridProps) {
  // Build a 6-week grid (Sun–Sat) covering the month
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const entryByDate = new Map(days.map((d) => [d.date, d.entries]))

  const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {gridDays.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const entries = entryByDate.get(dateStr) ?? []
          const isOtherMonth = !isSameMonth(day, month)
          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')

          return (
            <div
              key={idx}
              className={`min-h-24 border-r border-b last-col:border-r-0 p-1.5 ${
                isOtherMonth ? 'bg-muted/20' : ''
              } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
            >
              {/* Day number */}
              <div
                className={`w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1 ${
                  isToday
                    ? 'bg-primary text-primary-foreground font-bold'
                    : isOtherMonth
                      ? 'text-muted-foreground'
                      : 'font-medium'
                }`}
              >
                {format(day, 'd')}
              </div>

              {/* PM event bars */}
              <div className="space-y-0.5">
                {entries.slice(0, 3).map((entry) => (
                  <button
                    key={entry.scheduleId}
                    onClick={() => onEntryClick(entry)}
                    className={`w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded border truncate ${
                      entry.isOverdue
                        ? 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                        : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                    } transition-colors`}
                    title={`${entry.title} — ${entry.assetName}`}
                  >
                    {entry.title}
                  </button>
                ))}
                {entries.length > 3 && (
                  <p className="text-[10px] text-muted-foreground pl-1">
                    +{entries.length - 3} เพิ่มเติม
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">ยังไม่มีแผนบำรุงรักษา</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-xs">
        สร้างแผนบำรุงรักษาเชิงป้องกันแรกของคุณเพื่อเริ่มติดตามสุขภาพอุปกรณ์
      </p>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4 mr-1" /> สร้างแผน
      </Button>
    </div>
  )
}
