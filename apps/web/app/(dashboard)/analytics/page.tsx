'use client'
import { useState } from 'react'
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ASSETS = ['Pump A', 'HVAC-1', 'Conveyor', 'Chiller', 'Generator']
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6']
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b']

const mtbf = MONTHS.map((m, i) => ({
  m,
  ...Object.fromEntries(ASSETS.map((a, j) => [a, (300 + j * 40 + Math.sin(i + j) * 30) | 0])),
}))
const mttr = MONTHS.map((m, i) => ({
  m,
  ...Object.fromEntries(ASSETS.map((a, j) => [a, (4 + j + Math.cos(i + j) * 1.5) | 0])),
}))
const volume = MONTHS.map((m, i) => ({
  m,
  CORRECTIVE: 8 + (i % 4),
  PREVENTIVE: 12 - (i % 3),
  INSPECTION: 5 + (i % 2),
}))
const costPie = [
  { name: 'Labor', value: 42000 },
  { name: 'Parts', value: 28000 },
  { name: 'Contractor', value: 15000 },
]
const costBar = MONTHS.map((m, i) => ({
  m,
  Mechanical: 3000 + i * 200,
  Electrical: 2000 + i * 150,
  HVAC: 1500 + i * 100,
  Civil: 800 + i * 50,
}))
const reliability = [
  { asset: 'HVAC-1', mtbf: 320, mttr: 6.2, avail: 98.1, openWOs: 2, trend: '↑' },
  { asset: 'Conveyor', mtbf: 210, mttr: 8.4, avail: 96.7, openWOs: 5, trend: '↓' },
  { asset: 'Pump A', mtbf: 480, mttr: 4.1, avail: 99.1, openWOs: 1, trend: '↑' },
  { asset: 'Chiller', mtbf: 180, mttr: 11.2, avail: 93.8, openWOs: 7, trend: '↓' },
  { asset: 'Generator', mtbf: 540, mttr: 3.8, avail: 99.3, openWOs: 0, trend: '→' },
].sort((a, b) => a.avail - b.avail)

const tip = { contentStyle: { fontSize: 11 }, wrapperStyle: { zIndex: 50 } }

type Period = 'week' | 'month' | 'quarter'

export default function AnalyticsPage() {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('month')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)

  async function generateReport() {
    setReport('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, data: {} }),
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

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">12-month reliability & cost overview</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Generate AI Report
        </Button>
      </div>

      <div className="p-6 space-y-8">
        {/* ── Section 1: KPI Trends ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">KPI Trends</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { label: 'MTBF (hrs)', data: mtbf, unit: 'h' },
              { label: 'MTTR (hrs)', data: mttr, unit: 'h' },
            ].map(({ label, data, unit }) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={data} {...tip}>
                    <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit={unit} width={36} />
                    <Tooltip {...tip} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    {ASSETS.map((a, i) => (
                      <Line key={a} dataKey={a} stroke={COLORS[i]!} dot={false} strokeWidth={1.5} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}

            <div className="rounded-xl border bg-card p-4 lg:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">WO Volume by Type</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={volume} {...tip}>
                  <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip {...tip} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  {['CORRECTIVE', 'PREVENTIVE', 'INSPECTION'].map((t, i) => (
                    <Bar key={t} dataKey={t} stackId="a" fill={COLORS[i]!} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── Section 2: Cost Breakdown ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">Cost Breakdown</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Cost Mix</p>
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
                      <Cell key={i} fill={PIE_COLORS[i]!} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} {...tip} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Monthly Cost by Asset Category
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costBar} {...tip}>
                  <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={40}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} {...tip} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  {['Mechanical', 'Electrical', 'HVAC', 'Civil'].map((c, i) => (
                    <Bar key={c} dataKey={c} stackId="b" fill={COLORS[i]!} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── Section 3: Reliability Table ── */}
        <section>
          <h2 className="text-base font-semibold mb-4">
            Reliability — sorted by availability (worst first)
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {['Asset', 'MTBF (h)', 'MTTR (h)', 'Availability %', 'Open WOs', 'Trend'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {reliability.map((r) => (
                  <tr key={r.asset} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.asset}</td>
                    <td className="px-4 py-3">{r.mtbf}</td>
                    <td className="px-4 py-3">{r.mttr}</td>
                    <td
                      className={`px-4 py-3 font-medium ${r.avail >= 99 ? 'text-green-600' : r.avail >= 97 ? 'text-amber-600' : 'text-red-600'}`}
                    >
                      {r.avail}%
                    </td>
                    <td className="px-4 py-3">{r.openWOs}</td>
                    <td
                      className={`px-4 py-3 text-lg ${r.trend === '↑' ? 'text-green-600' : r.trend === '↓' ? 'text-red-600' : 'text-muted-foreground'}`}
                    >
                      {r.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Maintenance Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={generateReport} disabled={loading}>
                {loading ? 'Generating…' : 'Generate'}
              </Button>
            </div>
            {report && (
              <>
                <div className="rounded-md border bg-muted/30 p-4 max-h-80 overflow-y-auto text-sm space-y-0.5 font-mono">
                  {report.split('\n').map((line, i) => (
                    <p key={i}>{line || ' '}</p>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(report)}
                >
                  Copy report
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
