"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  PauseCircle,
  Send,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  workOrders,
  getAssetById,
  getUserById,
  type WOStatus,
  type WOPriority,
} from "@/lib/mock-data"
import { cn } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────────────────────

const woNum = (id: string) =>
  `WO-${String(workOrders.findIndex((w) => w.id === id) + 1).padStart(3, "0")}`

const today = new Date().toISOString().slice(0, 10)

const PRI: Record<WOPriority, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-amber-500 text-white",
  MEDIUM: "bg-blue-500 text-white",
  LOW: "bg-gray-400 text-white",
}

const STS: Record<WOStatus, string> = {
  OPEN: "bg-gray-200 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
}

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", map[v])}>
      {v.replace("_", " ")}
    </span>
  )
}

// ── static labour entries per WO ──────────────────────────────────────────────

const LABOR: Record<string, { date: string; hours: number; rate: number }[]> = {
  wo1: [
    { date: "2026-05-20", hours: 2.0, rate: 150 },
    { date: "2026-05-21", hours: 3.5, rate: 150 },
  ],
  wo2: [{ date: "2026-05-18", hours: 1.0, rate: 120 }],
  wo3: [
    { date: "2026-05-15", hours: 2.0, rate: 130 },
    { date: "2026-05-16", hours: 1.5, rate: 130 },
  ],
  wo4: [
    { date: "2026-05-12", hours: 3.0, rate: 120 },
    { date: "2026-05-13", hours: 2.0, rate: 120 },
  ],
  wo5: [{ date: "2026-05-21", hours: 4.0, rate: 160 }],
  wo6: [{ date: "2026-04-24", hours: 0.5, rate: 120 }],
  wo7: [{ date: "2026-04-17", hours: 1.0, rate: 130 }],
  wo8: [
    { date: "2026-04-01", hours: 1.5, rate: 120 },
    { date: "2026-04-01", hours: 0.5, rate: 120 },
  ],
}

// ── static seed comments ──────────────────────────────────────────────────────

const SEED_COMMENTS: Record<string, { author: string; initials: string; time: string; text: string }[]> = {
  wo1: [
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-05-20 09:15", text: "Prioritised as CRITICAL — production line cannot run with active seal leak. Parts ordered from supplier." },
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-05-20 11:42", text: "Confirmed visual leak. Tagged out Pump P-001. Seal kit in stores confirmed — will start tomorrow morning." },
  ],
  wo2: [
    { author: "Prasit Tanaka", initials: "PT", time: "2026-05-18 08:00", text: "Belt dressing and new tension gauge ready. Scheduled for end-of-shift window." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-05-18 10:30", text: "Make sure to document belt deflection before and after tensioning." },
  ],
  wo3: [
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-05-15 14:00", text: "Started disassembly of PRV-12. Spring shows slight fatigue — ordered replacement spring as precaution." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-05-16 08:30", text: "Replacement spring arrived. Continue calibration once installed." },
  ],
  wo4: [
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-05-12 13:00", text: "Chemical flush started. Scale heavy on south face — will need second pass." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-05-13 09:00", text: "Efficiency report shows improvement after first flush. Proceed with second pass today." },
  ],
  wo5: [
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-05-21 10:00", text: "Load bank arranged for 2026-06-01. Coordinate with operations to ensure site is clear." },
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-05-21 11:15", text: "Data logger calibrated and ready. Will set up instrumentation the day before." },
  ],
  wo6: [
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-04-20 08:00", text: "OEM part #AC-FILTER-02 confirmed in stock. Scheduled replacement for 2026-04-24." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-04-24 12:00", text: "Great work — filter swapped on schedule and within budget." },
  ],
  wo7: [
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-04-10 09:00", text: "Reference portable meter borrowed from instrumentation team. Starting calibration today." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-04-17 15:00", text: "SCADA tag updated. Control room confirmed readings now match the reference." },
  ],
  wo8: [
    { author: "Prasit Tanaka",   initials: "PT", time: "2026-03-28 07:30", text: "Belt-slip alarm triggered twice on night shift. LOTO applied; will assess tensioner today." },
    { author: "Nittaya Boonsri", initials: "NB", time: "2026-04-01 16:00", text: "Good catch on the lagging wear — flagged for next shutdown window." },
  ],
}

// ── detail page ───────────────────────────────────────────────────────────────

export default function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const base = workOrders.find((w) => w.id === id)

  // local state mirrors the WO so the user can cycle status without a backend
  const [status, setStatus] = useState<WOStatus>(base?.status ?? "OPEN")
  const [comment, setComment] = useState("")
  const [comments, setComments] = useState(
    SEED_COMMENTS[id] ?? [
      { author: "System", initials: "SY", time: today + " 00:00", text: "Work order created." },
      { author: "System", initials: "SY", time: today + " 00:01", text: "Assignee notified." },
    ]
  )

  if (!base) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-semibold">Work order not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/work-orders")}>
          <ArrowLeft className="mr-2 size-4" /> Back to Work Orders
        </Button>
      </div>
    )
  }

  const asset = getAssetById(base.assetId)
  const assignee = getUserById(base.assignedTo)
  const labor = LABOR[id] ?? []
  const laborTotal = labor.reduce((sum, r) => sum + r.hours * r.rate, 0)

  function handleAddComment() {
    const text = comment.trim()
    if (!text) return
    const now = new Date()
    const ts = now.toISOString().slice(0, 16).replace("T", " ")
    setComments((prev) => [...prev, { author: "John Doe", initials: "JD", time: ts, text }])
    setComment("")
  }

  return (
    <div className="space-y-5">
      {/* ── Back button ── */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push("/work-orders")}
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
          {status === "OPEN" && (
            <Button size="sm" onClick={() => setStatus("IN_PROGRESS")}>
              <Play className="mr-1.5 size-4" />
              Start
            </Button>
          )}
          {status === "IN_PROGRESS" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setStatus("OPEN")}>
                <PauseCircle className="mr-1.5 size-4" />
                Hold
              </Button>
              <Button size="sm" onClick={() => setStatus("COMPLETED")}>
                <CheckCircle2 className="mr-1.5 size-4" />
                Complete
              </Button>
            </>
          )}
          {status === "COMPLETED" && (
            <Button size="sm" variant="outline" onClick={() => setStatus("IN_PROGRESS")}>
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
                <AvatarFallback>{assignee.avatarInitials}</AvatarFallback>
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
              base.dueDate < today && status !== "COMPLETED"
                ? "font-semibold text-red-600"
                : ""
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
              {base.description ?? "No description provided."}
            </p>
          </section>

          {status === "COMPLETED" && (
            <section className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                Resolution
              </p>
              <p className="leading-relaxed text-sm">
                {base.resolution ?? "Completed without additional notes."}
              </p>
            </section>
          )}
        </TabsContent>

        {/* Labor & Cost tab */}
        <TabsContent value="labor" className="mt-4">
          {labor.length === 0 ? (
            <p className="text-sm text-muted-foreground">No labor entries recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium text-right">Hours</th>
                  <th className="pb-2 pr-4 font-medium text-right">Rate (฿/hr)</th>
                  <th className="pb-2 font-medium text-right">Total (฿)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {labor.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">{row.date}</td>
                    <td className="py-2 pr-4 text-right">{row.hours.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right">{row.rate.toLocaleString()}</td>
                    <td className="py-2 text-right">{(row.hours * row.rate).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-foreground/20 font-semibold">
                  <td className="pt-2 pr-4">Total</td>
                  <td className="pt-2 pr-4 text-right">
                    {labor.reduce((s, r) => s + r.hours, 0).toFixed(1)}
                  </td>
                  <td className="pt-2 pr-4" />
                  <td className="pt-2 text-right">{laborTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
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
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddComment()
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

// ── small helper component ────────────────────────────────────────────────────

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  )
}
