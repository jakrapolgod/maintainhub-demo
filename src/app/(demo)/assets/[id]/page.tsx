"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, QrCode, Download, Wrench } from "lucide-react"
import QRCode from "qrcode"

import {
  assets, workOrders, pmSchedules, getUserById,
  type AssetStatus, type CriticalityClass, type WOStatus, type WOPriority, type PMFrequency,
} from "@/lib/mock-data"
import { Button }   from "@/components/ui/button"
import { Badge }    from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// ── static per-asset extended details ────────────────────────────────────────

const ASSET_DETAILS: Record<string, {
  manufacturer:   string
  model:          string
  serial:         string
  installDate:    string
  warrantyExpiry: string
}> = {
  a1: { manufacturer: "Grundfos",          model: "CR 32-5",      serial: "GF-2023-44821",  installDate: "2023-03-15", warrantyExpiry: "2026-03-15" },
  a2: { manufacturer: "Atlas Copco",       model: "GA 37 VSD",    serial: "AC-2022-98133",  installDate: "2022-08-01", warrantyExpiry: "2025-08-01" },
  a3: { manufacturer: "Intralox",          model: "S-Series 900", serial: "IX-2021-77442",  installDate: "2021-06-20", warrantyExpiry: "2024-06-20" },
  a4: { manufacturer: "Baltimore Aircoil", model: "FXV-82B",      serial: "BAC-2020-55119", installDate: "2020-11-10", warrantyExpiry: "2023-11-10" },
  a5: { manufacturer: "Cummins",           model: "C550 D5",      serial: "CM-2024-11293",  installDate: "2024-01-05", warrantyExpiry: "2027-01-05" },
}

// ── static per-asset reliability metrics ─────────────────────────────────────

const ASSET_METRICS: Record<string, {
  mtbf:         number   // hrs
  mttr:         number   // hrs
  availability: number   // %
  cost:         number   // ฿
}> = {
  a1: { mtbf: 312, mttr: 3.8, availability: 98.8, cost: 124500 },
  a2: { mtbf: 240, mttr: 5.2, availability: 97.1, cost: 218000 },
  a3: { mtbf: 480, mttr: 2.1, availability: 99.4, cost:  87300 },
  a4: { mtbf: 600, mttr: 4.5, availability: 99.1, cost:  56800 },
  a5: { mtbf: 720, mttr: 6.0, availability: 99.7, cost: 342100 },
}

// ── lookup maps ───────────────────────────────────────────────────────────────

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

const PRI_CLASS: Record<WOPriority, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-amber-500 text-white",
  MEDIUM:   "bg-blue-500 text-white",
  LOW:      "bg-gray-400 text-white",
}

const STS_CLASS: Record<WOStatus, string> = {
  OPEN:        "bg-gray-200 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED:   "bg-green-100 text-green-800",
}

const WO_DOT: Record<WOStatus, string> = {
  OPEN:        "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED:   "bg-green-500",
}

// ── small helpers ─────────────────────────────────────────────────────────────

function woNum(id: string) {
  return `WO-${String(workOrders.findIndex((w) => w.id === id) + 1).padStart(3, "0")}`
}

/** Compliance % for a PM: 100 if on-time, lower if overdue. */
function pmCompliance(pm: { frequency: PMFrequency; nextDue: string; isOverdue: boolean }): number {
  if (!pm.isOverdue) return 100
  const todayMs  = new Date("2026-05-22").getTime()
  const dueMs    = new Date(pm.nextDue).getTime()
  const daysOver = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
  const period   = pm.frequency === "MONTHLY" ? 30 : 90
  return Math.round(Math.max(50, ((period - daysOver) / period) * 100))
}

// ── tiny shared components ────────────────────────────────────────────────────

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", map[v] ?? "bg-muted text-muted-foreground")}>
      {v.replace(/_/g, " ")}
    </span>
  )
}

function InfoRow({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <p className="shrink-0 text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-right text-sm font-medium", warn && "text-amber-600")}>{value}</p>
    </div>
  )
}

// ── QR Code Dialog ────────────────────────────────────────────────────────────

function QRDialog({ tag, name }: { tag: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string>("")

  // Generate once on mount (client-side only)
  useEffect(() => {
    QRCode.toDataURL(window.location.href, { width: 240, margin: 2 }).then(setDataUrl)
  }, [])

  function handleDownload() {
    const a = document.createElement("a")
    a.href     = dataUrl
    a.download = `${tag}-qr.png`
    a.click()
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <QrCode className="mr-1.5 size-4" />
        QR Code
      </DialogTrigger>

      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Asset QR Code</DialogTitle>
        </DialogHeader>

        <p className="text-center text-xs text-muted-foreground">{name}</p>

        {dataUrl ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <img src={dataUrl} alt={`QR code for ${name}`} className="size-52 rounded" />
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="mr-1.5 size-4" />
              Download PNG
            </Button>
          </div>
        ) : (
          <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">
            Generating…
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, unit, warn,
}: {
  label: string; value: string; unit?: string; warn?: boolean
}) {
  return (
    <div className="space-y-1 rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tabular-nums", warn && "text-amber-600")}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id }   = use(params)
  const router   = useRouter()
  const today    = "2026-05-22"

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

  const assetWOs = workOrders
    .filter((w) => w.assetId === asset.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const assetPMs = pmSchedules.filter((p) => p.assetId === asset.id)
  const details  = ASSET_DETAILS[asset.id]
  const metrics  = ASSET_METRICS[asset.id]

  return (
    <div className="space-y-6">
      {/* ── Back ── */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push("/assets")}>
        <ArrowLeft className="mr-1.5 size-4" />
        Assets
      </Button>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="font-mono text-sm text-muted-foreground">{asset.tag}</p>
          <h2 className="text-xl font-semibold">{asset.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS_CLASS[asset.status])}>
              {STATUS_LABEL[asset.status]}
            </span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className={cn("size-2.5 rounded-full", CRIT_DOT[asset.criticality])} />
              <span className="font-medium">Class {asset.criticality} — {CRIT_LABEL[asset.criticality]}</span>
            </div>
          </div>
        </div>
        <QRDialog tag={asset.tag} name={asset.name} />
      </div>

      {/* ── Metrics row (4 cards) ── */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="MTBF"             value={String(metrics.mtbf)}                  unit="hrs" />
          <MetricCard label="MTTR"             value={String(metrics.mttr)}                  unit="hrs" />
          <MetricCard
            label="Availability"
            value={`${metrics.availability}%`}
            warn={metrics.availability < 98}
          />
          <MetricCard label="Maintenance Cost" value={`฿${metrics.cost.toLocaleString()}`} />
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">
            Work History{assetWOs.length > 0 && ` (${assetWOs.length})`}
          </TabsTrigger>
          <TabsTrigger value="pm">
            PM Schedules{assetPMs.length > 0 && ` (${assetPMs.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4">
          <div className="divide-y rounded-lg border bg-card px-4">
            {details && (
              <>
                <InfoRow label="Manufacturer"    value={details.manufacturer} />
                <InfoRow label="Model"           value={details.model} />
                <InfoRow label="Serial Number"   value={<span className="font-mono">{details.serial}</span>} />
                <InfoRow label="Install Date"    value={details.installDate} />
                <InfoRow
                  label="Warranty Expiry"
                  value={
                    <span className="flex items-center gap-1.5">
                      {details.warrantyExpiry}
                      {details.warrantyExpiry < today && (
                        <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                      )}
                    </span>
                  }
                  warn={details.warrantyExpiry < today}
                />
              </>
            )}
            <InfoRow label="Asset Number"     value={<span className="font-mono">{asset.tag}</span>} />
            <InfoRow label="Location"         value={asset.location} />
            <InfoRow label="Last Maintenance" value={asset.lastMaintenanceDate} />
          </div>
        </TabsContent>

        {/* ── Work History (timeline) ── */}
        <TabsContent value="history" className="mt-4">
          {assetWOs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work orders for this asset.</p>
          ) : (
            <div className="space-y-0">
              {assetWOs.slice(0, 5).map((wo, i, arr) => (
                <div key={wo.id} className="flex gap-3">
                  {/* dot + connecting line */}
                  <div className="flex w-3.5 shrink-0 flex-col items-center pt-[18px]">
                    <div className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-background", WO_DOT[wo.status])} />
                    {i < arr.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>

                  {/* WO card */}
                  <div
                    className={cn(
                      "flex-1 cursor-pointer rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm",
                      i < arr.length - 1 ? "mb-3" : "mb-0"
                    )}
                    onClick={() => router.push(`/work-orders/${wo.id}`)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium leading-snug">{wo.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">{woNum(wo.id)}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Chip v={wo.priority} map={PRI_CLASS} />
                        <Chip v={wo.status}   map={STS_CLASS} />
                      </div>
                    </div>
                    <p className={cn(
                      "mt-2 text-xs",
                      wo.status === "COMPLETED"
                        ? "text-muted-foreground"
                        : wo.dueDate < today
                          ? "font-semibold text-red-600"
                          : "text-muted-foreground"
                    )}>
                      {wo.status === "COMPLETED" && wo.completedAt
                        ? `Completed ${wo.completedAt}`
                        : `Due ${wo.dueDate}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── PM Schedules ── */}
        <TabsContent value="pm" className="mt-4 space-y-3">
          {assetPMs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PM schedules for this asset.</p>
          ) : (
            assetPMs.map((pm) => {
              const assignee  = getUserById(pm.assignedTo)
              const compliance = pmCompliance(pm)
              return (
                <div
                  key={pm.id}
                  className={cn(
                    "space-y-3 rounded-lg border p-4",
                    pm.isOverdue
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                      : "bg-card"
                  )}
                >
                  {/* title + due */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{pm.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {pm.frequency} · {assignee?.name ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {pm.isOverdue && (
                        <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                      )}
                      <span className="text-muted-foreground">Next due: <span className="font-medium text-foreground">{pm.nextDue}</span></span>
                    </div>
                  </div>

                  {/* compliance bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Compliance</span>
                      <span className={cn("font-semibold", compliance < 80 ? "text-amber-600" : "text-green-600")}>
                        {compliance}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          compliance < 80 ? "bg-amber-500" : "bg-green-500"
                        )}
                        style={{ width: `${compliance}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
