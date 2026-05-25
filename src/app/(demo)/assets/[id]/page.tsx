'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, QrCode, Download, Wrench } from 'lucide-react'
import QRCode from 'qrcode'

import {
  assets,
  workOrders,
  pmSchedules,
  getUserById,
  assetReliability,
  type AssetStatus,
  type CriticalityClass,
  type WOStatus,
  type WOPriority,
} from '@/lib/mock-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// (Asset details and metrics are derived from mock data fields and assetReliability)

// ── lookup maps ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<AssetStatus, string> = {
  OPERATIONAL: 'OPERATIONAL',
  UNDER_MAINTENANCE: 'IN MAINTENANCE',
  STANDBY: 'STANDBY',
  DECOMMISSIONED: 'DECOMMISSIONED',
}

const STATUS_CLASS: Record<AssetStatus, string> = {
  OPERATIONAL: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  UNDER_MAINTENANCE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  STANDBY: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  DECOMMISSIONED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const CRIT_DOT: Record<CriticalityClass, string> = {
  A: 'bg-red-500',
  B: 'bg-amber-500',
  C: 'bg-green-500',
}

const CRIT_LABEL: Record<CriticalityClass, string> = {
  A: 'Critical',
  B: 'Major',
  C: 'Minor',
}

const PRI_CLASS: Record<WOPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-amber-500 text-white',
  MEDIUM: 'bg-blue-500 text-white',
  LOW: 'bg-gray-400 text-white',
}

const STS_CLASS: Record<WOStatus, string> = {
  OPEN: 'bg-gray-200 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  DRAFT: 'bg-purple-100 text-purple-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  CANCELLED: 'bg-red-100 text-red-700',
}

const WO_DOT: Record<WOStatus, string> = {
  OPEN: 'bg-gray-400',
  IN_PROGRESS: 'bg-blue-500',
  COMPLETED: 'bg-green-500',
  DRAFT: 'bg-purple-400',
  ON_HOLD: 'bg-amber-500',
  CANCELLED: 'bg-red-400',
}

// ── small helpers ─────────────────────────────────────────────────────────────

function woNum(id: string) {
  return `WO-${String(workOrders.findIndex((w) => w.id === id) + 1).padStart(3, '0')}`
}

/** Use pre-computed compliance % from the PM schedule. */
function pmCompliance(pm: { compliancePct: number }): number {
  return pm.compliancePct
}

// ── tiny shared components ────────────────────────────────────────────────────

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-xs font-semibold',
        map[v] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {v.replace(/_/g, ' ')}
    </span>
  )
}

function InfoRow({
  label,
  value,
  warn,
}: {
  label: string
  value: React.ReactNode
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <p className="shrink-0 text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-right text-sm font-medium', warn && 'text-amber-600')}>{value}</p>
    </div>
  )
}

// ── QR Code Dialog ────────────────────────────────────────────────────────────

function QRDialog({ tag, name }: { tag: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string>('')

  // Generate once on mount (client-side only)
  useEffect(() => {
    QRCode.toDataURL(window.location.href, { width: 240, margin: 2 }).then(setDataUrl)
  }, [])

  function handleDownload() {
    const a = document.createElement('a')
    a.href = dataUrl
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
  label,
  value,
  unit,
  warn,
}: {
  label: string
  value: string
  unit?: string
  warn?: boolean
}) {
  return (
    <div className="space-y-1 rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-2xl font-bold tabular-nums', warn && 'text-amber-600')}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const today = '2026-05-22'

  const asset = assets.find((a) => a.id === id)

  if (!asset) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Wrench className="size-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Asset not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/assets')}>
          <ArrowLeft className="mr-2 size-4" /> Back to Assets
        </Button>
      </div>
    )
  }

  const assetWOs = workOrders
    .filter((w) => w.assetId === asset.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const assetPMs = pmSchedules.filter((p) => p.assetId === asset.id)
  const reliability = assetReliability.find((r) => r.assetId === asset.id)
  const metrics = reliability
    ? {
        mtbf: reliability.mtbfHours,
        mttr: reliability.mttrHours,
        availability: reliability.availabilityPct,
        cost: reliability.totalCostThisYear,
      }
    : null

  return (
    <div className="space-y-6">
      {/* ── Back ── */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push('/assets')}>
        <ArrowLeft className="mr-1.5 size-4" />
        Assets
      </Button>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="font-mono text-sm text-muted-foreground">{asset.tag}</p>
          <h2 className="text-xl font-semibold">{asset.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_CLASS[asset.status])}
            >
              {STATUS_LABEL[asset.status]}
            </span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className={cn('size-2.5 rounded-full', CRIT_DOT[asset.criticality])} />
              <span className="font-medium">
                Class {asset.criticality} — {CRIT_LABEL[asset.criticality]}
              </span>
            </div>
          </div>
        </div>
        <QRDialog tag={asset.tag} name={asset.name} />
      </div>

      {/* ── Metrics row (4 cards) ── */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="MTBF" value={String(metrics.mtbf)} unit="hrs" />
          <MetricCard label="MTTR" value={String(metrics.mttr)} unit="hrs" />
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
            {asset.manufacturer && <InfoRow label="Manufacturer" value={asset.manufacturer} />}
            {asset.model && <InfoRow label="Model" value={asset.model} />}
            {asset.serialNumber && (
              <InfoRow
                label="Serial Number"
                value={<span className="font-mono">{asset.serialNumber}</span>}
              />
            )}
            <InfoRow label="Node Type" value={asset.nodeType} />
            <InfoRow label="Asset Tag" value={<span className="font-mono">{asset.tag}</span>} />
            <InfoRow label="Location" value={asset.location} />
            {asset.lastMaintenanceDate && (
              <InfoRow label="Last Maintenance" value={asset.lastMaintenanceDate} />
            )}
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
                    <div
                      className={cn(
                        'size-2.5 shrink-0 rounded-full ring-2 ring-background',
                        WO_DOT[wo.status],
                      )}
                    />
                    {i < arr.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                  </div>

                  {/* WO card */}
                  <div
                    className={cn(
                      'flex-1 cursor-pointer rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm',
                      i < arr.length - 1 ? 'mb-3' : 'mb-0',
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
                        <Chip v={wo.status} map={STS_CLASS} />
                      </div>
                    </div>
                    <p
                      className={cn(
                        'mt-2 text-xs',
                        wo.status !== 'COMPLETED' && wo.dueDate < today
                          ? 'font-semibold text-red-600'
                          : 'text-muted-foreground',
                      )}
                    >
                      {wo.status === 'COMPLETED' && wo.completedAt
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
              const assignee = getUserById(pm.assignedTo)
              const compliance = pmCompliance(pm)
              return (
                <div
                  key={pm.id}
                  className={cn(
                    'space-y-3 rounded-lg border p-4',
                    pm.isOverdue
                      ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                      : 'bg-card',
                  )}
                >
                  {/* title + due */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{pm.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {pm.frequency} · {assignee?.name ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {pm.isOverdue && (
                        <Badge variant="destructive" className="text-[10px]">
                          Overdue
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        Next due: <span className="font-medium text-foreground">{pm.nextDue}</span>
                      </span>
                    </div>
                  </div>

                  {/* compliance bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Compliance</span>
                      <span
                        className={cn(
                          'font-semibold',
                          compliance < 80 ? 'text-amber-600' : 'text-green-600',
                        )}
                      >
                        {compliance}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          compliance < 80 ? 'bg-amber-500' : 'bg-green-500',
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
