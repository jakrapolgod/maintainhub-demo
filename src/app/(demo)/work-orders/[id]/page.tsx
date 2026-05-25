'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, CheckCircle2, PauseCircle, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  workOrders,
  getAssetById,
  getUserById,
  type WOStatus,
  type WOPriority,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

const woNum = (id: string) =>
  `WO-${String(workOrders.findIndex((w) => w.id === id) + 1).padStart(3, '0')}`

const today = new Date().toISOString().slice(0, 10)

const PRI: Record<WOPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-amber-500 text-white',
  MEDIUM: 'bg-blue-500 text-white',
  LOW: 'bg-gray-400 text-white',
}

const STS: Record<WOStatus, string> = {
  OPEN: 'bg-gray-200 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  DRAFT: 'bg-purple-100 text-purple-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  CANCELLED: 'bg-red-100 text-red-700',
}

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', map[v])}>
      {v.replace('_', ' ')}
    </span>
  )
}

// (labor and comments are derived directly from the WO's laborEntries and comments fields)

// ── small helper component ────────────────────────────────────────────────────

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  )
}

// ── detail page ───────────────────────────────────────────────────────────────

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const base = workOrders.find((w) => w.id === id)

  // local state mirrors the WO so the user can cycle status without a backend
  const [status, setStatus] = useState<WOStatus>(base?.status ?? 'OPEN')
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState(
    base?.comments.map((c) => ({
      author: c.author,
      initials: c.author
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join(''),
      time: c.createdAt.slice(0, 16).replace('T', ' '),
      text: c.message,
    })) ?? [
      { author: 'System', initials: 'SY', time: `${today} 00:00`, text: 'Work order created.' },
    ],
  )

  if (!base) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-semibold">Work order not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/work-orders')}>
          <ArrowLeft className="mr-2 size-4" /> Back to Work Orders
        </Button>
      </div>
    )
  }

  const asset = getAssetById(base.assetId)
  const assignee = getUserById(base.assignedTo)
  const labor = base.laborEntries.map((e) => ({
    date: e.date,
    hours: e.hours,
    rate: e.ratePerHour,
  }))
  const laborTotal = labor.reduce((sum, r) => sum + r.hours * r.rate, 0)
  const parts = base.partUsages

  function handleAddComment() {
    const text = comment.trim()
    if (!text) return
    const now = new Date()
    const ts = now.toISOString().slice(0, 16).replace('T', ' ')
    setComments((prev) => [...prev, { author: 'John Doe', initials: 'JD', time: ts, text }])
    setComment('')
  }

  return (
    <div className="space-y-5">
      {/* ── Back button ── */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push('/work-orders')}
      >
        <ArrowLeft className="mr-1.5 size-4" />
        Work Orders
      </Button>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{woNum(id)}</p>
          <h2 className="text-xl font-semibold leading-tight">{base.title}</h2>
          <Chip v={status} map={STS} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {status === 'OPEN' && (
            <Button size="sm" onClick={() => setStatus('IN_PROGRESS')}>
              <Play className="mr-1.5 size-4" />
              Start
            </Button>
          )}
          {status === 'IN_PROGRESS' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setStatus('OPEN')}>
                <PauseCircle className="mr-1.5 size-4" />
                Hold
              </Button>
              <Button size="sm" onClick={() => setStatus('COMPLETED')}>
                <CheckCircle2 className="mr-1.5 size-4" />
                Complete
              </Button>
            </>
          )}
          {status === 'COMPLETED' && (
            <Button size="sm" variant="outline" onClick={() => setStatus('IN_PROGRESS')}>
              <Play className="mr-1.5 size-4" />
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* ── Info grid ── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <InfoItem label="Asset">
          {asset ? (
            <span className="font-medium">{asset.name}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </InfoItem>

        <InfoItem label="Priority">
          <Chip v={base.priority} map={PRI} />
        </InfoItem>

        <InfoItem label="Assignee">
          {assignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar size="sm">
                <AvatarFallback>{assignee.avatar}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{assignee.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </InfoItem>

        <InfoItem label="Created">{base.createdAt}</InfoItem>

        <InfoItem label="Due Date">
          <span
            className={cn(
              base.dueDate < today && status !== 'COMPLETED' ? 'font-semibold text-red-600' : '',
            )}
          >
            {base.dueDate}
          </span>
        </InfoItem>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="labor">Labor &amp; Cost</TabsTrigger>
          <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details" className="mt-4 space-y-4">
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="leading-relaxed text-sm">
              {base.description ?? 'No description provided.'}
            </p>
          </section>

          {status === 'COMPLETED' && (
            <section className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                Resolution
              </p>
              <p className="leading-relaxed text-sm">
                {base.resolution ?? 'Completed without additional notes.'}
              </p>
            </section>
          )}
        </TabsContent>

        {/* Labor & Cost tab */}
        <TabsContent value="labor" className="mt-4 space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Labor
            </p>
            {labor.length === 0 ? (
              <p className="text-sm text-muted-foreground">No labor entries recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Technician</th>
                    <th className="pb-2 pr-4 font-medium text-right">Hours</th>
                    <th className="pb-2 pr-4 font-medium text-right">Rate (฿/hr)</th>
                    <th className="pb-2 font-medium text-right">Total (฿)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {labor.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {base.laborEntries[i]?.technicianName}
                      </td>
                      <td className="py-2 pr-4 text-right">{row.hours.toFixed(1)}</td>
                      <td className="py-2 pr-4 text-right">{row.rate.toLocaleString()}</td>
                      <td className="py-2 text-right">{(row.hours * row.rate).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-foreground/20 font-semibold">
                    <td className="pt-2 pr-4">Total</td>
                    <td className="pt-2 pr-4" />
                    <td className="pt-2 pr-4 text-right">
                      {labor.reduce((s, r) => s + r.hours, 0).toFixed(1)}
                    </td>
                    <td className="pt-2 pr-4" />
                    <td className="pt-2 text-right">{laborTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {parts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Parts Used
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Part #</th>
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                    <th className="pb-2 pr-4 font-medium text-right">Unit Cost (฿)</th>
                    <th className="pb-2 font-medium text-right">Total (฿)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parts.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-mono text-xs">{p.partNumber}</td>
                      <td className="py-2 pr-4">{p.partName}</td>
                      <td className="py-2 pr-4 text-right">{p.qty}</td>
                      <td className="py-2 pr-4 text-right">{p.unitCost.toLocaleString()}</td>
                      <td className="py-2 text-right">{(p.qty * p.unitCost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Comments tab */}
        <TabsContent value="comments" className="mt-4 space-y-4">
          <div className="space-y-3">
            {comments.map((c, i) => (
              <div key={i} className="flex gap-3">
                <Avatar size="sm" className="mt-0.5 shrink-0">
                  <AvatarFallback>{c.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{c.author}</span>
                    <span className="text-xs text-muted-foreground">{c.time}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Add comment */}
          <div className="flex gap-2 pt-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              className="min-h-[72px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
              }}
            />
            <Button
              size="icon"
              className="mt-auto shrink-0"
              onClick={handleAddComment}
              disabled={!comment.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
