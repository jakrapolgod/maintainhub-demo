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
import { workOrders, getUserById } from '@/lib/mock-data'

const MOCK_CONTEXT = JSON.stringify({
  openWorkOrders: 12,
  overdueSLA: 3,
  pmCompliance: '87%',
  mttr: '4.2 hrs',
  assetsNeedingAttention: [
    { name: 'Cooling Tower CT-004', issue: 'Overdue PM', daysSince: 112 },
    { name: 'Conveyor CB-003', issue: 'Overdue PM', daysSince: 97 },
    { name: 'Compressor AC-002', issue: 'In Maintenance', daysSince: 61 },
  ],
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
          Your facility has <strong>3 SLA breaches</strong> and <strong>87% PM compliance</strong>{' '}
          this week. Cooling Tower CT-004 is 112 days overdue — consider escalating before the next
          quarterly audit.
        </p>
      </CardContent>
    </Card>
  )
}

const woStatusData = [
  { s: 'Open', n: 3 },
  { s: 'In Progress', n: 2 },
  { s: 'Completed', n: 3 },
]
const mttrData = [
  { w: 'W11', v: 5.2 },
  { w: 'W12', v: 4.8 },
  { w: 'W13', v: 6.1 },
  { w: 'W14', v: 4.5 },
  { w: 'W15', v: 3.9 },
  { w: 'W16', v: 4.2 },
  { w: 'W17', v: 5.0 },
  { w: 'W18', v: 3.7 },
  { w: 'W19', v: 4.1 },
  { w: 'W20', v: 3.8 },
  { w: 'W21', v: 4.4 },
  { w: 'W22', v: 4.2 },
]
const attentionAssets = [
  { name: 'Cooling Tower CT-004', issue: 'Overdue PM', days: 112 },
  { name: 'Conveyor CB-003', issue: 'Overdue PM', days: 97 },
  { name: 'Compressor AC-002', issue: 'In Maintenance', days: 61 },
]
const PRI = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'secondary',
  LOW: 'outline',
} as const
const STS = { OPEN: 'secondary', IN_PROGRESS: 'default', COMPLETED: 'outline' } as const

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
            <p className="text-3xl font-bold text-amber-500">12</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue SLA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>PM Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-2xl font-bold text-green-600">87%</p>
            <Progress value={87} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MTTR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-500">4.2 hrs</p>
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
              <BarChart data={woStatusData}>
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
              <LineChart data={mttrData}>
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
                {workOrders.slice(0, 5).map((wo, i) => (
                  <tr key={wo.id}>
                    <td className="py-1.5 pr-2 font-mono text-xs">{`WO-${String(i + 1).padStart(3, '0')}`}</td>
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
