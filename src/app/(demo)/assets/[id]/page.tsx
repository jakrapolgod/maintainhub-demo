"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Wrench } from "lucide-react"
import { assets, workOrders, pmSchedules, getUserById, type AssetStatus, type CriticalityClass } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────────────────────

function categoryFromName(name: string): string {
  const match = name.match(/^([A-Za-z ]+?)\s+[A-Z]+-\d+/)
  return match ? match[1].trim() : name
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE:      "OPERATIONAL",
  INACTIVE:    "INACTIVE",
  MAINTENANCE: "IN MAINTENANCE",
}

const STATUS_CLASS: Record<AssetStatus, string> = {
  ACTIVE:      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  INACTIVE:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  MAINTENANCE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
}

const CRIT_DOT: Record<CriticalityClass, string> = {
  A: "bg-red-500",
  B: "bg-amber-500",
  C: "bg-green-500",
}

const CRIT_LABEL: Record<CriticalityClass, string> = {
  A: "Critical",
  B: "Major",
  C: "Minor",
}

const PRI_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-amber-500 text-white",
  MEDIUM:   "bg-blue-500 text-white",
  LOW:      "bg-gray-400 text-white",
}

const STS_CLASS: Record<string, string> = {
  OPEN:        "bg-gray-200 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED:   "bg-green-100 text-green-800",
}

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", map[v])}>
      {v.replace("_", " ")}
    </span>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const asset = assets.find((a) => a.id === id)

  if (!asset) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Wrench className="size-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Asset not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/assets")}>
          <ArrowLeft className="mr-2 size-4" /> Back to Assets
        </Button>
      </div>
    )
  }

  const assetWOs = workOrders.filter((w) => w.assetId === asset.id)
  const assetPMs = pmSchedules.filter((p) => p.assetId === asset.id)
  const category = categoryFromName(asset.name)

  return (
    <div className="space-y-6">
      {/* back */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push("/assets")}>
        <ArrowLeft className="mr-1.5 size-4" />
        Assets
      </Button>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm text-muted-foreground">{asset.tag}</p>
            <Badge variant="outline" className="text-xs">{category}</Badge>
          </div>
          <h2 className="text-xl font-semibold">{asset.name}</h2>
          <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-medium", STATUS_CLASS[asset.status])}>
            {STATUS_LABEL[asset.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("size-2.5 rounded-full", CRIT_DOT[asset.criticality])} />
          <span className="font-medium">Class {asset.criticality} — {CRIT_LABEL[asset.criticality]}</span>
        </div>
      </div>

      {/* info grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border bg-card p-5 sm:grid-cols-3 lg:grid-cols-4">
        <InfoItem label="Asset Number">{asset.tag}</InfoItem>
        <InfoItem label="Location">{asset.location}</InfoItem>
        <InfoItem label="Last Maintenance">{asset.lastMaintenanceDate}</InfoItem>
        <InfoItem label="Open Work Orders">
          <span className={assetWOs.filter(w => w.status !== "COMPLETED").length > 0 ? "text-amber-600" : ""}>
            {assetWOs.filter((w) => w.status !== "COMPLETED").length}
          </span>
        </InfoItem>
      </div>

      {/* work orders */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Work Orders</h3>
        {assetWOs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work orders for this asset.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {["WO #", "Title", "Priority", "Status", "Due Date", "Assignee"].map((h) => (
                  <th key={h} className="pb-2 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assetWOs.map((wo, i) => {
                const assignee = getUserById(wo.assignedTo)
                const num = `WO-${String(workOrders.findIndex((w) => w.id === wo.id) + 1).padStart(3, "0")}`
                const today = new Date().toISOString().slice(0, 10)
                return (
                  <tr
                    key={wo.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/work-orders/${wo.id}`)}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{num}</td>
                    <td className="py-2 pr-3 max-w-[180px] truncate">{wo.title}</td>
                    <td className="py-2 pr-3"><Chip v={wo.priority} map={PRI_CLASS} /></td>
                    <td className="py-2 pr-3"><Chip v={wo.status} map={STS_CLASS} /></td>
                    <td className={cn(
                      "py-2 pr-3 text-xs",
                      wo.dueDate < today && wo.status !== "COMPLETED" ? "font-semibold text-red-600" : "text-muted-foreground"
                    )}>{wo.dueDate}</td>
                    <td className="py-2 text-xs text-muted-foreground">{assignee?.name.split(" ")[0]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* PM schedules */}
      {assetPMs.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">PM Schedules</h3>
          <div className="space-y-2">
            {assetPMs.map((pm) => {
              const assignee = getUserById(pm.assignedTo)
              return (
                <div
                  key={pm.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm",
                    pm.isOverdue ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "bg-card"
                  )}
                >
                  <div className="space-y-0.5">
                    <p className="font-medium">{pm.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {pm.frequency} · Assignee: {assignee?.name ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">Last: {pm.lastDone}</span>
                    <span className={pm.isOverdue ? "font-semibold text-amber-600" : "text-muted-foreground"}>
                      Next: {pm.nextDue}
                    </span>
                    {pm.isOverdue && (
                      <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
