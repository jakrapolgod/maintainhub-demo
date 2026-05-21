'use client'

/**
 * Asset Detail — full detail page.
 *
 * Header: asset number + name + badges + quick stats + action buttons
 * Tabs: Overview | Work Orders | PM Schedules | Documents | Metrics | QR Code
 */
import { useState, useCallback } from 'react'
import { useRouter }    from 'next/navigation'
import Link             from 'next/link'
import { useDropzone }  from 'react-dropzone'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format }       from 'date-fns'
import {
  ArrowLeft, Settings, AlertTriangle, CheckCircle, Wrench,
  Archive, MapPin, FileText, QrCode, BarChart2, History,
  Upload, Trash2, Download, Printer, ExternalLink, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button }   from '@/components/ui/button'
import { Badge }    from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

import { CriticalityBadge, AssetStatusBadge } from '@/components/assets/AssetBadges'
import { AssetForm } from '@/components/assets/AssetForm'

import {
  useAsset, useAssetMetrics, useAssetWorkOrders, useAssetPMSchedules,
  useAssetDocuments, useUpdateAsset, useChangeAssetStatus,
  useDecommissionAsset, useUploadAssetDocument, useDeleteAssetDocument,
} from '@/hooks/useAssets'
import { getAssetQRCode, getAssetLabelUrl } from '@/lib/api/assets'
import type { UpdateAssetPayload } from '@/lib/api/assets'

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetDetailClient({ id }: { id: string }) {
  const router  = useRouter()
  const { data: asset, isPending, error, refetch } = useAsset(id)

  const [editOpen,        setEditOpen]        = useState(false)
  const [decommOpen,      setDecommOpen]      = useState(false)
  const [decommReason,    setDecommReason]    = useState('')
  const [activeTab,       setActiveTab]       = useState('overview')

  const updateMutation      = useUpdateAsset(id)
  const statusMutation      = useChangeAssetStatus(id)
  const decommMutation      = useDecommissionAsset(id)

  // ── Loading / error ────────────────────────────────────────────────────────

  if (isPending) return <Skeleton className="m-6 h-64 rounded-xl" />
  if (error || !asset) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Asset not found.</p>
        <Button variant="outline" onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  const isDecommissioned = asset.status === 'DECOMMISSIONED'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b bg-background px-6 py-4 shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Link href="/assets" className="hover:underline">Assets</Link>
          <span>/</span>
          {asset.parentId && (
            <>
              <Link href={`/assets/${asset.parentId}`} className="hover:underline">
                {asset.parentName ?? asset.parentId}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-foreground font-medium">{asset.assetNumber}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{asset.name}</h1>
                <CriticalityBadge criticality={asset.criticality} />
                <AssetStatusBadge status={asset.status} />
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{asset.assetNumber}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isDecommissioned && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Settings className="h-4 w-4 mr-1" />Edit
              </Button>
            )}
            {asset.status === 'OPERATIONAL' && (
              <Button
                variant="outline" size="sm"
                onClick={() => statusMutation.mutate({ newStatus: 'UNDER_MAINTENANCE' })}
              >
                <Wrench className="h-4 w-4 mr-1" />Set Maintenance
              </Button>
            )}
            {asset.status === 'UNDER_MAINTENANCE' && (
              <Button
                variant="outline" size="sm"
                onClick={() => statusMutation.mutate({ newStatus: 'OPERATIONAL' })}
              >
                <CheckCircle className="h-4 w-4 mr-1" />Set Operational
              </Button>
            )}
            {!isDecommissioned && (
              <Button
                variant="destructive" size="sm"
                onClick={() => setDecommOpen(true)}
              >
                <Archive className="h-4 w-4 mr-1" />Decommission
              </Button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <StatCard label="MTBF" value={asset.metrics.mtbfHours > 0 ? `${asset.metrics.mtbfHours.toFixed(0)}h` : '—'} />
          <StatCard label="MTTR" value={asset.metrics.mttrHours > 0 ? `${asset.metrics.mttrHours.toFixed(0)}h` : '—'} />
          <StatCard label="Availability" value={`${asset.metrics.availability.toFixed(1)}%`} highlight={asset.metrics.availability < 90} />
          <StatCard label="Total Cost" value={asset.metrics.totalLifetimeCost > 0 ? `฿${(asset.metrics.totalLifetimeCost / 1000).toFixed(1)}k` : '—'} />
          <StatCard label="Open WOs" value={String(asset.metrics.openWorkOrders)} highlight={asset.metrics.openWorkOrders > 0} />
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-6 mt-3 shrink-0 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="work-orders">Work Orders</TabsTrigger>
            <TabsTrigger value="pm-schedules">PM Schedules</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="qr">QR Code</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto px-6 pb-6">
            {/* Overview */}
            <TabsContent value="overview">
              <OverviewTab asset={asset} />
            </TabsContent>

            {/* Work Orders */}
            <TabsContent value="work-orders">
              <WorkOrdersTab assetId={id} />
            </TabsContent>

            {/* PM Schedules */}
            <TabsContent value="pm-schedules">
              <PMSchedulesTab assetId={id} />
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents">
              <DocumentsTab assetId={id} />
            </TabsContent>

            {/* Metrics */}
            <TabsContent value="metrics">
              <MetricsTab assetId={id} asset={asset} />
            </TabsContent>

            {/* QR Code */}
            <TabsContent value="qr">
              <QRTab assetId={id} assetNumber={asset.assetNumber} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── Edit slide-over ───────────────────────────────────────────────── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Edit {asset.assetNumber}</SheetTitle></SheetHeader>
          <div className="mt-4">
            <AssetForm
              asset={asset}
              onSubmit={async (values) => {
                await updateMutation.mutateAsync(values as UpdateAssetPayload)
                setEditOpen(false)
              }}
              onCancel={() => setEditOpen(false)}
              submitLabel="Save Changes"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Decommission dialog ───────────────────────────────────────────── */}
      <Dialog open={decommOpen} onOpenChange={setDecommOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Archive className="h-5 w-5" />
              Decommission {asset.assetNumber}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This is irreversible. All active PM schedules will be deactivated.
          </p>
          <textarea
            className="w-full rounded-md border px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Reason for decommissioning (required)…"
            value={decommReason}
            onChange={(e) => setDecommReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecommOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!decommReason.trim() || decommMutation.isPending}
              onClick={async () => {
                await decommMutation.mutateAsync({ reason: decommReason })
                setDecommOpen(false)
              }}
            >
              Decommission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? 'border-destructive/40 bg-destructive/5' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-destructive' : ''}`}>{value}</p>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ asset }: { asset: ReturnType<typeof useAsset>['data'] & object }) {
  if (!asset) return null
  const fields = [
    ['Category',        asset.categoryName],
    ['Location',        asset.locationName ?? '—'],
    ['Manufacturer',    asset.manufacturer ?? '—'],
    ['Model',           asset.model ?? '—'],
    ['Serial Number',   asset.serialNumber ?? '—'],
    ['Install Date',    asset.installDate ? format(new Date(asset.installDate), 'MMM d, yyyy') : '—'],
    ['Warranty Expiry', asset.warrantyExpiry ? format(new Date(asset.warrantyExpiry), 'MMM d, yyyy') : '—'],
    ['Last Updated',    format(new Date(asset.updatedAt), 'MMM d, yyyy')],
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
      {/* Main fields */}
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Asset Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {asset.description && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{asset.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Children */}
      <div className="space-y-4">
        {asset.children.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Sub-assets ({asset.children.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {asset.children.map((child) => (
                <Link key={child.id} href={`/assets/${child.id}`} className="flex items-center gap-2 text-sm hover:underline p-1 rounded hover:bg-accent">
                  <CriticalityBadge criticality={child.criticality} dotOnly />
                  <span className="font-mono text-xs text-muted-foreground">{child.assetNumber}</span>
                  <span className="truncate">{child.name}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent WOs */}
        {asset.recentWorkOrders.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Work Orders</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {asset.recentWorkOrders.slice(0, 5).map((wo) => (
                <div key={wo.id} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-muted-foreground">{wo.woNumber}</span>
                    <p className="truncate max-w-[160px]">{wo.title}</p>
                  </div>
                  <Badge variant={wo.status === 'COMPLETED' ? 'outline' : 'secondary'} className="text-[10px] shrink-0">
                    {wo.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Work Orders tab ────────────────────────────────────────────────────────────

function WorkOrdersTab({ assetId }: { assetId: string }) {
  const { data, isPending } = useAssetWorkOrders(assetId)
  if (isPending) return <Skeleton className="h-64 w-full mt-4 rounded-xl" />
  const wos = data?.data ?? []
  return (
    <div className="pt-4">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {['WO #', 'Title', 'Type', 'Priority', 'Status', 'Completed', 'Cost'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wos.map((wo) => (
            <tr key={wo.id} className="border-b hover:bg-muted/20">
              <td className="px-3 py-2 font-mono text-xs">{wo.woNumber}</td>
              <td className="px-3 py-2 max-w-[200px] truncate">{wo.title}</td>
              <td className="px-3 py-2 text-xs">{wo.type}</td>
              <td className="px-3 py-2 text-xs">{wo.priority}</td>
              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{wo.status.replace('_', ' ')}</Badge></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {wo.completedAt ? format(new Date(wo.completedAt), 'MMM d, yyyy') : '—'}
              </td>
              <td className="px-3 py-2 text-xs">
                {wo.totalCost !== null ? `฿${wo.totalCost.toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
          {wos.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">No work orders yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── PM Schedules tab ──────────────────────────────────────────────────────────

function PMSchedulesTab({ assetId }: { assetId: string }) {
  const { data: schedules = [], isPending } = useAssetPMSchedules(assetId)
  if (isPending) return <Skeleton className="h-64 w-full mt-4 rounded-xl" />
  return (
    <div className="pt-4 space-y-3">
      {schedules.map((pm) => (
        <Card key={pm.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <p className="font-medium text-sm">{pm.title}</p>
              <p className="text-xs text-muted-foreground">{pm.triggerType}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Next due</p>
              <p className="text-sm font-medium">
                {pm.nextDue ? format(new Date(pm.nextDue), 'MMM d, yyyy') : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
      {schedules.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">No PM schedules.</p>
      )}
    </div>
  )
}

// ── Documents tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ assetId }: { assetId: string }) {
  const { data: docs = [], isPending, refetch } = useAssetDocuments(assetId)
  const uploadMutation = useUploadAssetDocument(assetId)
  const deleteMutation = useDeleteAssetDocument(assetId)

  const onDrop = useCallback((files: File[]) => {
    files.forEach((f) => uploadMutation.mutate(f))
  }, [uploadMutation])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 50 * 1024 * 1024,
  })

  if (isPending) return <Skeleton className="h-64 w-full mt-4 rounded-xl" />

  return (
    <div className="pt-4 space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive ? 'Drop files here…' : 'Drag & drop files, or click to select (max 50 MB)'}
        </p>
        {uploadMutation.isPending && (
          <p className="text-xs text-primary mt-1">Uploading…</p>
        )}
      </div>

      {/* File grid */}
      {docs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map((doc) => (
            <Card key={doc.id} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground mb-1" />
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(doc.fileSize / 1024).toFixed(0)} KB · {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {doc.signedUrl && (
                      <a href={doc.signedUrl} download target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Metrics tab ───────────────────────────────────────────────────────────────

function MetricsTab({ assetId, asset }: { assetId: string; asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const { data: metrics, isPending } = useAssetMetrics(assetId)

  if (isPending) return <Skeleton className="h-64 w-full mt-4 rounded-xl" />
  if (!metrics) return null

  return (
    <div className="pt-4 space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="MTBF" value={`${metrics.mtbfHours.toFixed(1)}h`} />
        <StatCard label="MTTR" value={`${metrics.mttrHours.toFixed(1)}h`} />
        <StatCard label="Availability" value={`${metrics.availability.toFixed(1)}%`} highlight={metrics.availability < 90} />
        <StatCard label="Failures (12mo)" value={String(metrics.failureCount)} />
      </div>

      {/* MTTR trend chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly MTTR Trend (last 12 months)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics.mttrTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis unit="h" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}h`, 'MTTR']} />
              <Line type="monotone" dataKey="mttrHours" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="MTTR (h)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cost breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lifetime Cost Breakdown</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{
              name: 'Cost',
              Labor: metrics.totalLaborCost,
              Parts: metrics.totalPartsCost,
            }]}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`฿${Number(v).toLocaleString()}`, '']} />
              <Legend />
              <Bar dataKey="Labor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Parts" fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Availability gauge (simple text-based) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Availability</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(metrics.availability, 100)}%` }}
              />
            </div>
            <span className="text-lg font-bold w-16 text-right">{metrics.availability.toFixed(1)}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {metrics.failureCount} corrective WOs in the last 12 months (MTBF/{`MTBF+MTTR`})
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── QR Code tab ───────────────────────────────────────────────────────────────

function QRTab({ assetId, assetNumber }: { assetId: string; assetNumber: string }) {
  const qrUrl    = getAssetQRCode(assetId)
  const labelUrl = getAssetLabelUrl(assetId)
  const token    = typeof window !== 'undefined' ? sessionStorage.getItem('mh_access_token') : null

  function download(url: string, filename: string) {
    const a = document.createElement('a')
    a.href = `${url}?token=${token ?? ''}`
    a.download = filename
    a.target = '_blank'
    a.click()
  }

  return (
    <div className="pt-4 flex flex-col items-center gap-6 max-w-sm mx-auto">
      <Card className="w-full">
        <CardHeader><CardTitle className="text-center text-base">QR Code</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {/* QR image */}
          <img
            src={qrUrl}
            alt={`QR code for ${assetNumber}`}
            className="w-48 h-48 rounded border"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1 text-xs" onClick={() => download(qrUrl, `${assetNumber}_qr.png`)}>
              <Download className="h-3.5 w-3.5 mr-1" />Download QR
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader><CardTitle className="text-center text-base">Printable Label</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <img
            src={labelUrl}
            alt={`Label for ${assetNumber}`}
            className="rounded border max-w-full"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1 text-xs" onClick={() => download(labelUrl, `${assetNumber}_label.png`)}>
              <Download className="h-3.5 w-3.5 mr-1" />Download Label
            </Button>
            <Button
              variant="outline" className="flex-1 text-xs"
              onClick={() => {
                const win = window.open(labelUrl, '_blank')
                win?.focus()
              }}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />Print
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
