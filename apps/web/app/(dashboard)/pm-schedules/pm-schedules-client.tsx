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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import {
  usePMSchedules,
  usePMCalendar,
  usePMCompliance,
  useActivatePMSchedule,
  useDeactivatePMSchedule,
  useTriggerPMSchedule,
  useCreatePMSchedule,
} from '@/hooks/usePMSchedules'
import type { PMScheduleDto, PMCalendarEntry, PMFrequency } from '@/lib/api/pm-schedules'
import { useAssets } from '@/hooks/useAssets'

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextDueColor(nextDueAt: string | null, isOverdue: boolean): string {
  if (!nextDueAt) return 'text-muted-foreground'
  if (isOverdue) return 'text-red-600 font-medium'
  const days = differenceInDays(parseISO(nextDueAt), new Date())
  if (days <= 7) return 'text-amber-600 font-medium'
  return 'text-foreground'
}

function eventBarClass(entry: PMCalendarEntry): string {
  if (entry.isOverdue) return 'bg-red-600 text-white animate-pulse hover:bg-red-700'
  if (entry.type === 'METER') return 'bg-amber-500 text-white hover:bg-amber-600'
  if (entry.type === 'CONDITION') return 'bg-gray-400 text-white hover:bg-gray-500'
  return 'bg-blue-500 text-white hover:bg-blue-600'
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

  // ── Quick-create sheet ──────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    assetId: '',
    type: 'CALENDAR' as 'CALENDAR' | 'METER' | 'CONDITION',
    frequency: 'monthly' as PMFrequency,
    estimatedHours: '',
    description: '',
  })

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
  const createMut = useCreatePMSchedule()

  // ── Assets for create form ──────────────────────────────────────────────────
  const { data: assetsData } = useAssets({ limit: 200 })

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createMut.mutate(
      {
        title: createForm.title,
        assetId: createForm.assetId,
        type: createForm.type,
        taskList: [],
        ...(createForm.estimatedHours && { estimatedHours: parseFloat(createForm.estimatedHours) }),
        ...(createForm.description && { description: createForm.description }),
        ...(createForm.type === 'CALENDAR' && {
          calendarRule: { frequency: createForm.frequency, interval: 1 },
        }),
      },
      {
        onSuccess: () => {
          setCreateOpen(false)
          setCreateForm({
            title: '',
            assetId: '',
            type: 'CALENDAR',
            frequency: 'monthly',
            estimatedHours: '',
            description: '',
          })
        },
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
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> สร้างแผนบำรุงรักษา
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
              <EmptyState onNew={() => setCreateOpen(true)} />
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

      {/* ── Quick-create sheet ────────────────────────────────────────────── */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-[480px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>สร้างแผนบำรุงรักษา</SheetTitle>
            <SheetDescription>กรอกข้อมูลพื้นฐาน — แก้ไขรายละเอียดได้ในภายหลัง</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="cf-title">
                ชื่อแผน <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cf-title"
                required
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="เช่น PM รายเดือน ปั๊ม P-001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-asset">
                สินทรัพย์ <span className="text-red-500">*</span>
              </Label>
              <Select
                value={createForm.assetId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, assetId: v }))}
                required
              >
                <SelectTrigger id="cf-asset">
                  <SelectValue placeholder="เลือกสินทรัพย์" />
                </SelectTrigger>
                <SelectContent>
                  {(assetsData?.items ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.assetNumber} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-type">ประเภทการกระตุ้น</Label>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v as typeof f.type }))}
              >
                <SelectTrigger id="cf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALENDAR">ตามปฏิทิน</SelectItem>
                  <SelectItem value="METER">ตามมาตรวัด</SelectItem>
                  <SelectItem value="CONDITION">ตามสภาพ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createForm.type === 'CALENDAR' && (
              <div className="space-y-1.5">
                <Label htmlFor="cf-freq">ความถี่</Label>
                <Select
                  value={createForm.frequency}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, frequency: v as PMFrequency }))
                  }
                >
                  <SelectTrigger id="cf-freq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">รายวัน</SelectItem>
                    <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                    <SelectItem value="monthly">รายเดือน</SelectItem>
                    <SelectItem value="quarterly">รายไตรมาส</SelectItem>
                    <SelectItem value="annually">รายปี</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cf-hours">ชั่วโมงโดยประมาณ</Label>
              <Input
                id="cf-hours"
                type="number"
                min="0.5"
                step="0.5"
                value={createForm.estimatedHours}
                onChange={(e) => setCreateForm((f) => ({ ...f, estimatedHours: e.target.value }))}
                placeholder="เช่น 2.5"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-desc">รายละเอียด</Label>
              <Textarea
                id="cf-desc"
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="รายละเอียดแผนบำรุงรักษา..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMut.isPending || !createForm.title || !createForm.assetId}
              >
                {createMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                สร้างแผน
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Schedule detail slide-over ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold pr-6">{selectedEntry?.title}</SheetTitle>
            <SheetDescription>
              {selectedEntry?.assetName} · {selectedEntry ? typeLabel(selectedEntry.type) : ''}
            </SheetDescription>
          </SheetHeader>
          {selectedEntry && (
            <div className="mt-6 space-y-6">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    selectedEntry.isOverdue
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                  }`}
                >
                  {selectedEntry.isOverdue ? '⚠️ เกินกำหนด' : '✓ ตามกำหนด'}
                </span>
                <Badge variant={typeBadgeVariant(selectedEntry.type)}>
                  {typeLabel(selectedEntry.type)}
                </Badge>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">สินทรัพย์</p>
                  <p className="font-medium">{selectedEntry.assetName || 'ไม่ระบุ'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">หมายเลขสินทรัพย์</p>
                  <p className="font-medium">{selectedEntry.assetNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">เวลาโดยประมาณ</p>
                  <p className="font-medium">{selectedEntry.estimatedHours || 0} ชั่วโมง</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ประเภทแผน</p>
                  <p className="font-medium">{typeLabel(selectedEntry.type)}</p>
                </div>
              </div>

              {/* Assignees */}
              {selectedEntry.assignees.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">มอบหมายให้</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEntry.assignees.map((a) => (
                      <Badge key={a.id} variant="secondary">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => handleTriggerNow(selectedEntry.scheduleId)}
                  disabled={triggerMut.isPending}
                >
                  {triggerMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  เรียกใช้ทันที
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <Link
                    href={`/pm-schedules/${selectedEntry.scheduleId}/edit`}
                    onClick={() => setSheetOpen(false)}
                  >
                    แก้ไขแผน
                  </Link>
                </Button>
              </div>
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

function PMEntryTooltipContent({ entry }: { entry: PMCalendarEntry }) {
  return (
    <div className="max-w-[280px]">
      <div className="font-semibold text-white mb-2 text-sm leading-snug">{entry.title}</div>
      <div className="space-y-1.5 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-16 flex-shrink-0">สินทรัพย์</span>
          <span className="text-white truncate">{entry.assetName || 'ไม่ระบุ'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-16 flex-shrink-0">ประเภท</span>
          <span className="text-white">
            {entry.type === 'CALENDAR'
              ? 'ตามปฏิทิน'
              : entry.type === 'METER'
                ? 'ตามมาตรวัด'
                : 'ตามสภาพ'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-16 flex-shrink-0">สถานะ</span>
          <span className={entry.isOverdue ? 'text-red-400 font-medium' : 'text-green-400'}>
            {entry.isOverdue ? 'เกินกำหนด' : 'ตามกำหนด'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-16 flex-shrink-0">เวลาประมาณ</span>
          <span className="text-white">{entry.estimatedHours || 0} ชม.</span>
        </div>
        {entry.assignees.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-16 flex-shrink-0 pt-0.5">มอบหมาย</span>
            <span className="text-white">{entry.assignees.map((a) => a.name).join(', ')}</span>
          </div>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800 text-[10px] text-gray-500">
        คลิกเพื่อดูรายละเอียดเต็ม
      </div>
    </div>
  )
}

function PMCalendarGrid({ month, days, onEntryClick }: PMCalendarGridProps) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const entryByDate = new Map(days.map((d) => [d.date, d.entries]))

  const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

  return (
    <TooltipProvider delayDuration={200}>
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
            const visible = entries.slice(0, 3)
            const remaining = entries.length - visible.length
            const isOtherMonth = !isSameMonth(day, month)
            const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')

            return (
              <div
                key={idx}
                className={`min-h-24 border-r border-b p-1.5 ${
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
                  {visible.map((entry) => (
                    <Tooltip key={entry.scheduleId}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onEntryClick(entry)}
                          className={`w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate transition-colors ${eventBarClass(entry)}`}
                        >
                          {entry.title}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={6}
                        className="bg-gray-950 text-white border border-gray-800 px-4 py-3 shadow-xl rounded-lg"
                      >
                        <PMEntryTooltipContent entry={entry} />
                      </TooltipContent>
                    </Tooltip>
                  ))}

                  {remaining > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-[10px] text-muted-foreground hover:text-primary pl-1 w-full text-left transition-colors">
                          +{remaining} เพิ่มเติม
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 p-2" side="bottom" align="start">
                        <p className="text-xs font-medium mb-2 text-muted-foreground px-1">
                          รายการทั้งหมดวันที่ {format(day, 'd MMM')}
                        </p>
                        <div className="space-y-0.5">
                          {entries.slice(3).map((entry) => (
                            <button
                              key={entry.scheduleId}
                              className="w-full text-left p-2 hover:bg-muted rounded text-sm transition-colors"
                              onClick={() => onEntryClick(entry)}
                            >
                              <span className="block font-medium text-xs truncate">
                                {entry.title}
                              </span>
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {entry.assetName}
                              </span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
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
