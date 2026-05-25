'use client'

import { useState, useMemo } from 'react'
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
  LayoutList,
  CalendarDays,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Zap,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

import { pmSchedules, getAssetById, type PMSchedule } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

// ── Constants ──────────────────────────────────────────────────────────────────

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_CHIP: Record<string, string> = {
  CALENDAR: 'bg-blue-100 text-blue-800',
  METER: 'bg-amber-100 text-amber-800',
  CONDITION: 'bg-gray-100 text-gray-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dueColor(nextDue: string, isOverdue: boolean): string {
  if (isOverdue) return 'text-red-600 font-medium'
  if (differenceInDays(parseISO(nextDue), today) <= 7) return 'text-amber-600 font-medium'
  return 'text-foreground'
}

function complianceColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function complianceBar(pct: number): string {
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

function eventClass(s: PMSchedule): string {
  if (s.isOverdue) return 'bg-red-100 text-red-800 hover:bg-red-200'
  if (differenceInDays(parseISO(s.nextDue), today) <= 7)
    return 'bg-amber-100 text-amber-800 hover:bg-amber-200'
  return 'bg-blue-100 text-blue-800 hover:bg-blue-200'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PMSchedulesPage() {
  const [view, setView] = useState<'list' | 'calendar' | 'compliance'>('list')
  const [month, setMonth] = useState(() => new Date(2026, 4, 1))
  const [selected, setSelected] = useState<PMSchedule | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pmSchedules.map((s) => [s.id, s.isActive])),
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PMSchedule[]>()
    for (const s of pmSchedules) {
      const list = map.get(s.nextDue) ?? []
      list.push(s)
      map.set(s.nextDue, list)
    }
    return map
  }, [])

  const VIEWS = [
    { key: 'list', label: 'List', Icon: LayoutList },
    { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
    { key: 'compliance', label: 'Compliance', Icon: BarChart3 },
  ] as const

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">PM Schedules</h2>
        <Button size="sm" onClick={() => {}}>
          <Plus className="mr-1.5 size-4" /> New Schedule
        </Button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1" data-tour="pm-calendar">
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
              view === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── LIST VIEW ─────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                {['Title', 'Asset', 'Type', 'Next Due', 'Compliance', 'Active'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pmSchedules.map((s) => {
                const asset = getAssetById(s.assetId)
                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {asset?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium',
                          TYPE_CHIP[s.triggerType],
                        )}
                      >
                        {s.triggerType}
                      </span>
                    </td>
                    <td className={cn('px-4 py-3 text-xs', dueColor(s.nextDue, s.isOverdue))}>
                      {s.nextDue}
                      {s.isOverdue && (
                        <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-700">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-44">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              complianceBar(s.compliancePct),
                            )}
                            style={{ width: `${s.compliancePct}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            'w-9 text-right text-xs font-medium tabular-nums',
                            complianceColor(s.compliancePct),
                          )}
                        >
                          {s.compliancePct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        role="switch"
                        aria-checked={activeMap[s.id]}
                        onClick={() => setActiveMap((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                        className={cn(
                          'relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          activeMap[s.id] ? 'bg-primary' : 'bg-border',
                        )}
                      >
                        <span
                          className={cn(
                            'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                            activeMap[s.id] ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CALENDAR VIEW ─────────────────────────────────────────────────────── */}
      {view === 'calendar' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{format(month, 'MMMM yyyy')}</h3>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonth((m) => subMonths(m, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMonth(new Date(2026, 4, 1))}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
          <PMCalendar
            month={month}
            eventsByDate={eventsByDate}
            onSelect={(s) => {
              setSelected(s)
              setSheetOpen(true)
            }}
          />
        </>
      )}

      {/* ── COMPLIANCE VIEW ───────────────────────────────────────────────────── */}
      {view === 'compliance' && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                {['Schedule', 'Asset', 'Type', 'Triggers (actual / planned)'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pmSchedules.map((s) => {
                const asset = getAssetById(s.assetId)
                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {asset?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-medium',
                          TYPE_CHIP[s.triggerType],
                        )}
                      >
                        {s.triggerType}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-56">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              complianceBar(s.compliancePct),
                            )}
                            style={{ width: `${s.compliancePct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                          {s.actualTriggers}/{s.plannedTriggers}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SHEET (calendar event detail) ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>
                  {getAssetById(selected.assetId)?.name ?? '—'} · {selected.type}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Tasks</p>
                    <p className="font-medium">{selected.taskCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p
                      className={cn(
                        'font-medium',
                        selected.isOverdue ? 'text-red-600' : 'text-green-600',
                      )}
                    >
                      {selected.isOverdue ? 'Overdue' : 'On schedule'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next due</p>
                    <p className="font-medium">{selected.nextDue}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Frequency</p>
                    <p className="font-medium capitalize">
                      {selected.frequency?.toLowerCase() ?? selected.triggerType.toLowerCase()}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    toast.success(`Work order created for "${selected.title}"`)
                    setSheetOpen(false)
                  }}
                >
                  <Zap className="mr-2 size-4" />
                  Trigger Now
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Calendar grid ──────────────────────────────────────────────────────────────

interface CalendarProps {
  month: Date
  eventsByDate: Map<string, PMSchedule[]>
  onSelect: (s: PMSchedule) => void
}

function PMCalendar({ month, eventsByDate, onSelect }: CalendarProps) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  })

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const entries = eventsByDate.get(dateStr) ?? []
          const otherMonth = !isSameMonth(day, month)
          const isToday = dateStr === todayStr

          return (
            <div
              key={idx}
              className={cn(
                'min-h-24 border-r border-b p-1.5',
                idx % 7 === 6 && 'border-r-0',
                otherMonth && 'bg-muted/20',
              )}
            >
              <div
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday && 'bg-primary text-primary-foreground font-bold',
                  !isToday && otherMonth && 'text-muted-foreground',
                  !isToday && !otherMonth && 'font-medium',
                )}
              >
                {format(day, 'd')}
              </div>

              <div className="space-y-0.5">
                {entries.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s)}
                    className={cn(
                      'w-full truncate rounded text-left text-[10px] leading-tight px-1.5 py-0.5 transition-colors',
                      eventClass(s),
                    )}
                    title={s.title}
                  >
                    {s.title}
                  </button>
                ))}
                {entries.length > 3 && (
                  <p className="pl-1 text-[10px] text-muted-foreground">
                    +{entries.length - 3} more
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
