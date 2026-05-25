'use client'

import { useState, useRef } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  workOrders,
  getUserById,
  assets,
  pmSchedules,
  assetReliability,
  monthlyWOVolume,
  mttrTrend,
} from '@/lib/mock-data'

// ── Computed KPIs ─────────────────────────────────────────────────────────────
const openCount = workOrders.filter((w) =>
  ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(w.status),
).length

const slaBreachCount = workOrders.filter(
  (w) => w.slaBreach && w.status !== 'COMPLETED' && w.status !== 'CANCELLED',
).length

const pmCompliancePct = Math.round(
  pmSchedules.reduce((s, p) => s + p.compliancePct, 0) / pmSchedules.length,
)

const avgMttr = (
  assetReliability.reduce((s, a) => s + a.mttrHours, 0) / assetReliability.length
).toFixed(1)

// ── Chart data ────────────────────────────────────────────────────────────────
const woVolumeData = monthlyWOVolume.slice(-6).map((m) => ({
  s: m.month,
  n: m.corrective + m.preventive + m.inspection,
}))

const mttrChartData = mttrTrend.map((p, i) => ({ w: `W${i + 1}`, v: p.avgHours }))

// ── Attention assets (open CRITICAL WO or overdue PM) ────────────────────────
const attentionAssets = assets
  .filter(
    (a) =>
      workOrders.some(
        (w) =>
          w.assetId === a.id &&
          w.priority === 'CRITICAL' &&
          w.status !== 'COMPLETED' &&
          w.status !== 'CANCELLED',
      ) || pmSchedules.some((s) => s.assetId === a.id && s.isOverdue),
  )
  .slice(0, 5)
  .map((a) => {
    const critWO = workOrders.find(
      (w) =>
        w.assetId === a.id &&
        w.priority === 'CRITICAL' &&
        w.status !== 'COMPLETED' &&
        w.status !== 'CANCELLED',
    )
    const overduePM = pmSchedules.find((s) => s.assetId === a.id && s.isOverdue)
    return {
      name: a.name,
      issue: critWO ? 'Critical WO' : 'Overdue PM',
      days: critWO
        ? Math.floor((Date.now() - new Date(critWO.createdAt).getTime()) / 86_400_000)
        : Math.floor(
            (Date.now() - new Date(overduePM?.nextDue ?? Date.now()).getTime()) / 86_400_000,
          ),
    }
  })

// ── Recent WOs (last 5 by createdAt desc) ────────────────────────────────────
const recentWOs = [...workOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)

const MOCK_CONTEXT = JSON.stringify({
  openWorkOrders: openCount,
  overdueSLA: slaBreachCount,
  pmCompliance: `${pmCompliancePct}%`,
  mttr: `${avgMttr} hrs`,
  assetsNeedingAttention: attentionAssets,
})

function AiInsightCard() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleAsk() {
    if (!question.trim() || loading) return
    setAnswer('')
    setLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: MOCK_CONTEXT }),
        signal: abortRef.current.signal,
      })

      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read()
        if (done) break
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAnswer('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>AI Insight</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}>Ask AI</DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ask about your facility</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="e.g. Which assets are at highest risk this week?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAsk()
                }}
              />
              <Button onClick={handleAsk} disabled={loading} className="w-full">
                {loading ? 'Thinking…' : 'Send'}
              </Button>
              {answer && (
                <div className="rounded-md bg-muted p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {loading && <span className="ml-1 animate-pulse">▌</span>}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Your facility has{' '}
          <strong>
            {slaBreachCount} SLA breach{slaBreachCount !== 1 ? 'es' : ''}
          </strong>{' '}
          and <strong>{pmCompliancePct}% PM compliance</strong> this week.{' '}
          {attentionAssets[0] && (
            <>
              {attentionAssets[0].name} has an open {attentionAssets[0].issue.toLowerCase()} —
              consider escalating.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  )
}

const PRI = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'secondary',
  LOW: 'outline',
} as const
const STS = {
  OPEN: 'secondary',
  IN_PROGRESS: 'default',
  COMPLETED: 'outline',
  DRAFT: 'outline',
  ON_HOLD: 'secondary',
  CANCELLED: 'outline',
} as const

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-tour="kpi-cards">
        <Card>
          <CardHeader>
            <CardTitle>Open WOs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-500">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue SLA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{slaBreachCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>PM Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-2xl font-bold text-green-600">{pmCompliancePct}%</p>
            <Progress value={pmCompliancePct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MTTR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-500">{avgMttr} hrs</p>
          </CardContent>
        </Card>
      </div>
      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>WO by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={woVolumeData}>
                <XAxis dataKey="s" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="n" name="Work Orders" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MTTR Trend (12 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mttrChartData}>
                <XAxis dataKey="w" tick={{ fontSize: 12 }} />
                <YAxis domain={[2, 8]} tick={{ fontSize: 12 }} unit=" hr" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="v"
                  name="MTTR"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assets Needing Attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionAssets.map((a) => (
              <div key={a.name} className="flex items-center justify-between">
                <span className="text-sm font-medium">{a.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{a.issue}</Badge>
                  <span className="text-xs text-muted-foreground">{a.days}d ago</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Work Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  {['WO #', 'Title', 'Priority', 'Status', 'Assignee'].map((h) => (
                    <th key={h} className="pb-2 pr-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentWOs.map((wo) => (
                  <tr key={wo.id}>
                    <td className="py-1.5 pr-2 font-mono text-xs">{wo.id}</td>
                    <td className="py-1.5 pr-2 max-w-[130px] truncate">{wo.title}</td>
                    <td className="py-1.5 pr-2">
                      <Badge variant={PRI[wo.priority]}>{wo.priority}</Badge>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge variant={STS[wo.status]}>{wo.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {getUserById(wo.assignedTo)?.name.split(' ')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      {/* AI Insight */}
      <AiInsightCard />
    </div>
  )
}
