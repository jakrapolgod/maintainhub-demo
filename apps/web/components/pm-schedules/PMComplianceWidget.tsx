'use client'

/**
 * PMComplianceWidget — dashboard card.
 *
 * Left:  Donut chart — % compliant this month
 * Right: List of 5 most overdue schedules with days-overdue badge
 */
import Link from 'next/link'
import { differenceInDays, parseISO } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { ClipboardCheck, ChevronRight, Loader2, RefreshCw, AlertCircle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { usePMCompliance, usePMSchedules } from '@/hooks/usePMSchedules'

// ── Donut chart ───────────────────────────────────────────────────────────────

function ComplianceDonut({ pct }: { pct: number }) {
  const data = [
    { name: 'compliant', value: pct },
    { name: 'non-compliant', value: 100 - pct },
  ]
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center">
      <ResponsiveContainer width={96} height={96}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={44}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>
          {pct}%
        </span>
        <span className="text-[10px] text-muted-foreground">compliant</span>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PMComplianceWidgetProps {
  className?: string
}

export function PMComplianceWidget({ className }: PMComplianceWidgetProps) {
  const { data: compData, isPending: compPending, refetch } = usePMCompliance(1) // 1-month lookback
  const { data: listData, isPending: listPending } = usePMSchedules({ isActive: true, limit: 50 })

  // Most overdue schedules (isActive, nextDueAt in the past)
  const overdueItems = (listData?.items ?? [])
    .filter((s) => s.isOverdue && s.nextDueAt !== null)
    .sort((a, b) => new Date(a.nextDueAt!).getTime() - new Date(b.nextDueAt!).getTime())
    .slice(0, 5)

  const overallPct = compData?.overallCompliancePct ?? 0
  const isPending = compPending || listPending

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          PM Compliance
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link href="/pm-schedules?view=compliance">
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Donut + stats */}
            <div className="flex items-center gap-4">
              <ComplianceDonut pct={overallPct} />
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-muted-foreground">Compliant</span>
                  <span className="font-medium ml-auto">{compData?.fullyCompliant ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
                  <span className="text-muted-foreground">Total schedules</span>
                  <span className="font-medium ml-auto">{compData?.totalSchedules ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                  <span className="text-muted-foreground">Overdue</span>
                  <span className="font-medium ml-auto">{overdueItems.length}</span>
                </div>
              </div>
            </div>

            {/* Overdue list */}
            {overdueItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Most overdue
                </p>
                <ul className="space-y-1.5">
                  {overdueItems.map((s) => {
                    const daysOverdue = s.nextDueAt
                      ? differenceInDays(new Date(), parseISO(s.nextDueAt))
                      : 0
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/pm-schedules/${s.id}/edit`}
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{s.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.assetName}</p>
                          </div>
                          <Badge variant="destructive" className="shrink-0 text-[10px] py-0 px-1.5">
                            {daysOverdue}d overdue
                          </Badge>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {overdueItems.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <ClipboardCheck className="h-4 w-4" />
                All active schedules are on track
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
