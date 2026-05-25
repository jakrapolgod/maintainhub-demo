'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  monthlyWOVolume,
  mttrTrend,
  assetReliability,
  costBreakdown,
  assets,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const assetName = (id: string) => assets.find((a) => a.id === id)?.name ?? id

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const totalCost = costBreakdown.labor + costBreakdown.parts + costBreakdown.contractor

  return (
    <div className="space-y-6">
      {/* ── Cost breakdown KPIs ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            ['Total Maintenance Cost', `฿${totalCost.toLocaleString()}`, 'text-foreground'],
            ['Labor', `฿${costBreakdown.labor.toLocaleString()}`, 'text-blue-600'],
            ['Parts', `฿${costBreakdown.parts.toLocaleString()}`, 'text-amber-600'],
            ['Contractor', `฿${costBreakdown.contractor.toLocaleString()}`, 'text-purple-600'],
          ] as const
        ).map(([label, val, cls]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn('text-2xl font-bold tabular-nums', cls)}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly WO Volume */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly WO Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyWOVolume} margin={{ left: -10 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="corrective"
                  name="Corrective"
                  fill="#ef4444"
                  radius={[3, 3, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="preventive"
                  name="Preventive"
                  fill="#3b82f6"
                  radius={[0, 0, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="inspection"
                  name="Inspection"
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* MTTR Trend */}
        <Card>
          <CardHeader>
            <CardTitle>MTTR Trend (12 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mttrTrend} margin={{ left: -10 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[4, 9]} tick={{ fontSize: 11 }} unit=" hr" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="avgHours"
                  name="Avg MTTR"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Asset Reliability table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Reliability</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {['Asset', 'MTBF (hrs)', 'MTTR (hrs)', 'Availability', 'Cost YTD (฿)'].map((h) => (
                  <th key={h} className="pb-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assetReliability.map((r) => (
                <tr key={r.assetId} className="hover:bg-muted/40 transition-colors">
                  <td className="py-2 pr-4 font-medium">{assetName(r.assetId)}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.mtbfHours.toLocaleString()}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.mttrHours}</td>
                  <td
                    className={cn(
                      'py-2 pr-4 font-semibold tabular-nums',
                      r.availabilityPct < 99 ? 'text-amber-600' : 'text-green-600',
                    )}
                  >
                    {r.availabilityPct}%
                  </td>
                  <td className="py-2 tabular-nums">฿{r.totalCostThisYear.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
