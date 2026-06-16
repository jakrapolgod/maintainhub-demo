'use client'
import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAssetReliability,
  useCostBreakdown,
  usePMCompliance,
  useAnalyticsMetrics,
} from '@/hooks/useAnalytics'
import { useMe } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6']
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b']
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const tip = { contentStyle: { fontSize: 11 }, wrapperStyle: { zIndex: 50 } }

type Period = 'week' | 'month' | 'quarter'
type Range = '3m' | '6m' | '12m'

/** '2026-01' → 'Jan' */
function monthLabel(yyyyMm: string): string {
  const m = Number(yyyyMm.slice(5, 7))
  return MONTH_NAMES[m - 1] ?? yyyyMm
}

function fmtMoney(v: unknown): string {
  return `$${Number(v).toLocaleString()}`
}

export default function AnalyticsPage() {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('month')
  const [range, setRange] = useState<Range>('12m')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)

  const me = useMe()

  // Stable dateFrom so the query key (and server cache key) doesn't change on
  // every render — anchored to the first day of the month, N months back.
  const filters = useMemo(() => {
    const months = range === '3m' ? 2 : range === '6m' ? 5 : 11
    const now = new Date()
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
    return { dateFrom: from.toISOString() }
  }, [range])

  const reliability = useAssetReliability(filters)
  const costs = useCostBreakdown(filters)
  const compliance = usePMCompliance()
  const metrics = useAnalyticsMetrics(filters)

  // ── Chart data projections ──────────────────────────────────────────────────
  const seriesAssets = useMemo(
    () => Object.keys(reliability.data?.mtbfSeries[0]?.values ?? {}),
    [reliability.data],
  )

  const mtbfRows = useMemo(
    () =>
      (reliability.data?.mtbfSeries ?? []).map((p) => ({ m: monthLabel(p.month), ...p.values })),
    [reliability.data],
  )
  const mttrRows = useMemo(
    () =>
      (reliability.data?.mttrSeries ?? []).map((p) => ({ m: monthLabel(p.month), ...p.values })),
    [reliability.data],
  )
  const volumeRows = useMemo(
    () => (reliability.data?.volumeByType ?? []).map((p) => ({ ...p, m: monthLabel(p.month) })),
    [reliability.data],
  )

  const costPie = useMemo(() => {
    const mix = costs.data?.costMix
    if (!mix) return []
    return [
      { name: 'แรงงาน', value: mix.labor },
      { name: 'อะไหล่', value: mix.parts },
      { name: 'ผู้รับเหมา', value: mix.contractor },
    ].filter((s) => s.value > 0)
  }, [costs.data])

  const costCategories = useMemo(() => {
    const keys = new Set<string>()
    for (const m of costs.data?.monthlyByCategory ?? []) {
      for (const k of Object.keys(m.categories)) keys.add(k)
    }
    return [...keys].sort()
  }, [costs.data])

  const costRows = useMemo(
    () =>
      (costs.data?.monthlyByCategory ?? []).map((p) => ({
        m: monthLabel(p.month),
        ...p.categories,
      })),
    [costs.data],
  )

  const tableRows = reliability.data?.assets ?? []

  const isForbidden = reliability.error instanceof ApiError && reliability.error.status === 403

  async function generateReport() {
    setReport('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          data: {
            metrics: metrics.data ?? null,
            reliability: reliability.data?.assets ?? [],
            costMix: costs.data?.costMix ?? null,
            pmCompliancePct: compliance.data?.overallCompliancePct ?? null,
          },
        }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setReport((prev) => prev + decoder.decode(value))
      }
    } finally {
      setLoading(false)
    }
  }

  if (isForbidden) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          การวิเคราะห์ข้อมูลสำหรับผู้จัดการและผู้ดูแลระบบเท่านั้น
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">วิเคราะห์ข้อมูล</h1>
          <p className="text-sm text-muted-foreground">ภาพรวมความน่าเชื่อถือและต้นทุน</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">3 เดือนล่าสุด</SelectItem>
              <SelectItem value="6m">6 เดือนล่าสุด</SelectItem>
              <SelectItem value="12m">12 เดือนล่าสุด</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            ส่งออก ISO
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            รายงาน AI
          </Button>
        </div>
      </div>

      {/* ── ISO 9001 controlled-document header (print only) ── */}
      <div className="hidden print:block border-b px-6 py-4 text-sm">
        <div className="flex justify-between font-semibold">
          <span>MaintainHub — Maintenance Performance Report</span>
          <span>Doc ID: MH-RPT-ANL-001 · Rev A</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span>
            Reporting period:{' '}
            {reliability.data
              ? `${reliability.data.from.slice(0, 10)} to ${reliability.data.to.slice(0, 10)}`
              : '—'}
          </span>
          <span>
            Generated: {new Date().toISOString().slice(0, 10)} by {me.data?.name ?? '—'}
          </span>
        </div>
        <p className="text-xs mt-2 text-muted-foreground">
          Purpose &amp; scope: monitoring, measurement, analysis and evaluation of maintenance
          performance per ISO 9001:2015 clauses 9.1.1 / 9.1.3. Source records: work orders, PM
          schedules and inventory transactions in MaintainHub.
        </p>
      </div>

      <div className="p-6 space-y-8">
        {/* ── Section 0: KPI Summary ── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'ความสอดคล้อง PM',
                value:
                  compliance.data !== undefined ? `${compliance.data.overallCompliancePct}%` : null,
                sub:
                  compliance.data !== undefined
                    ? `${compliance.data.fullyCompliant}/${compliance.data.totalSchedules} แผนสอดคล้อง`
                    : '',
              },
              {
                label: 'MTTR',
                value: metrics.data !== undefined ? `${metrics.data.mttr ?? '—'} ชม.` : null,
                sub: 'เวลาเฉลี่ยในการซ่อม',
              },
              {
                label: 'WO เกินกำหนด',
                value: metrics.data !== undefined ? String(metrics.data.overdueCount) : null,
                sub: 'เกิน SLA ยังไม่ปิด',
              },
              {
                label: 'ต้นทุนรวม',
                value: costs.data !== undefined ? fmtMoney(costs.data.totalCost) : null,
                sub: 'แรงงาน + อะไหล่ + ผู้รับเหมา',
              },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                {value === null ? (
                  <Skeleton className="h-7 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-bold mt-1">{value}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 1: KPI Trends ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">แนวโน้ม KPI</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { label: 'MTBF (hrs)', data: mtbfRows, unit: 'h' },
              { label: 'MTTR (hrs)', data: mttrRows, unit: 'h' },
            ].map(({ label, data, unit }) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
                {reliability.isPending ? (
                  <Skeleton className="h-[140px] w-full" />
                ) : seriesAssets.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={data} {...tip}>
                      <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit={unit} width={36} />
                      <Tooltip {...tip} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      {seriesAssets.map((a, i) => (
                        <Line
                          key={a}
                          dataKey={a}
                          stroke={COLORS[i % COLORS.length]!}
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            ))}

            <div className="rounded-xl border bg-card p-4 lg:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">ปริมาณ WO ตามประเภท</p>
              {reliability.isPending ? (
                <Skeleton className="h-[140px] w-full" />
              ) : volumeRows.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={volumeRows} {...tip}>
                    <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={28} />
                    <Tooltip {...tip} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    {['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY'].map((t, i) => (
                      <Bar key={t} dataKey={t} stackId="a" fill={COLORS[i % COLORS.length]!} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 2: Cost Breakdown ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">การแจกแจงต้นทุน</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">สัดส่วนต้นทุน</p>
              {costs.isPending ? (
                <Skeleton className="h-[200px] w-full" />
              ) : costPie.length === 0 ? (
                <EmptyChart height={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={costPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100) | 0}%`}
                      labelLine={false}
                    >
                      {costPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} />
                      ))}
                    </Pie>
                    <Tooltip formatter={fmtMoney} {...tip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                ต้นทุนรายเดือนตามหมวดหมู่
              </p>
              {costs.isPending ? (
                <Skeleton className="h-[200px] w-full" />
              ) : costRows.length === 0 ? (
                <EmptyChart height={200} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={costRows} {...tip}>
                    <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={40}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip formatter={fmtMoney} {...tip} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    {costCategories.map((c, i) => (
                      <Bar key={c} dataKey={c} stackId="b" fill={COLORS[i % COLORS.length]!} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 3: Reliability Table ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">
            ความน่าเชื่อถือ — เรียงตามความพร้อมใช้งาน (แย่สุดก่อน)
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {[
                    'สินทรัพย์',
                    'MTBF (ชม.)',
                    'MTTR (ชม.)',
                    'ความพร้อม %',
                    'ความเสีย',
                    'WO เปิด',
                    'แนวโน้ม',
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
                {reliability.isPending ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-24 w-full" />
                    </td>
                  </tr>
                ) : tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      ไม่มีความเสียในช่วงเวลานี้
                    </td>
                  </tr>
                ) : (
                  tableRows.map((r) => (
                    <tr key={r.assetId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {r.assetName}
                        <span className="ml-2 text-xs text-muted-foreground">{r.assetNumber}</span>
                      </td>
                      <td className="px-4 py-3">{r.mtbfHours ?? '—'}</td>
                      <td className="px-4 py-3">{r.mttrHours ?? '—'}</td>
                      <td
                        className={`px-4 py-3 font-medium ${r.availabilityPct >= 99 ? 'text-green-600' : r.availabilityPct >= 97 ? 'text-amber-600' : 'text-red-600'}`}
                      >
                        {r.availabilityPct}%
                      </td>
                      <td className="px-4 py-3">{r.failureCount}</td>
                      <td className="px-4 py-3">{r.openWorkOrders}</td>
                      <td
                        className={`px-4 py-3 text-lg ${r.trend === 'up' ? 'text-green-600' : r.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}
                      >
                        {r.trend === 'up' ? '↑' : r.trend === 'down' ? '↓' : '→'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── ISO 9001 approval block (print only) ── */}
        <section className="hidden print:block pt-8">
          <table className="w-full text-sm border">
            <tbody>
              <tr>
                {['Prepared by', 'Reviewed by', 'Approved by'].map((role) => (
                  <td key={role} className="border p-4 align-top w-1/3">
                    <p className="text-xs font-medium">{role}</p>
                    <p className="mt-8 border-t pt-1 text-xs text-muted-foreground">
                      Name / Signature / Date
                    </p>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-2">
            Controlled document — retained as documented information per ISO 9001:2015 clause 7.5.3.
            MTTR/MTBF figures depend on technicians recording start and completion times on work
            orders.
          </p>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>รายงาน AI ซ่อมบำรุง</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">รายสัปดาห์</SelectItem>
                  <SelectItem value="month">รายเดือน</SelectItem>
                  <SelectItem value="quarter">รายไตรมาส</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={generateReport} disabled={loading}>
                {loading ? 'กำลังสร้าง…' : 'สร้างรายงาน'}
              </Button>
            </div>
            {report && (
              <>
                <div className="rounded-md border bg-muted/30 p-4 max-h-80 overflow-y-auto text-sm space-y-0.5 font-mono">
                  {report.split('\n').map((line, i) => (
                    <p key={i}>{line || ' '}</p>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(report)}
                >
                  คัดลอกรายงาน
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyChart({ height = 140 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-xs text-muted-foreground"
      style={{ height }}
    >
      ไม่มีข้อมูลสำหรับช่วงเวลานี้
    </div>
  )
}
