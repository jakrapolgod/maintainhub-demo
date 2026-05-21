'use client'

/**
 * Asset List — two-panel layout:
 *   Left: AssetTreePanel (collapsible, virtualized, drag-and-drop)
 *   Right: DataTable with toolbar (search, filters, export, import, new asset)
 */
import { useState, useCallback } from 'react'
import { useRouter }   from 'next/navigation'
import Link            from 'next/link'
import { format }      from 'date-fns'
import {
  Plus, Download, Upload, Search, SlidersHorizontal,
  ChevronLeft, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react'
import { toast }       from 'sonner'

import { Button }      from '@/components/ui/button'
import { Input }       from '@/components/ui/input'
import { Badge }       from '@/components/ui/badge'
import { Skeleton }    from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { AssetTreePanel }    from '@/components/assets/AssetTreePanel'
import { CriticalityBadge, AssetStatusBadge } from '@/components/assets/AssetBadges'
import { AssetForm }        from '@/components/assets/AssetForm'
import { BulkImportWizard } from '@/components/assets/BulkImportWizard'
import { QRScannerModal }   from '@/components/assets/QRScannerModal'

import { useAssets, useCategories, useLocations, useCreateAsset } from '@/hooks/useAssets'
import type { AssetCard, ListAssetsFilters, CreateAssetPayload } from '@/lib/api/assets'
import type { AssetFlatNode } from '@/lib/api/assets'

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetListClient() {
  const router = useRouter()

  // ── Sidebar state ──────────────────────────────────────────────────────────
  const [sidebarOpen,      setSidebarOpen]      = useState(true)
  const [treeSelectedId,   setTreeSelectedId]   = useState<string | null>(null)
  const [newAssetOpen,     setNewAssetOpen]     = useState(false)
  const [newChildParentId, setNewChildParentId] = useState<string | undefined>(undefined)
  const [importWizardOpen, setImportWizardOpen] = useState(false)

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [critFilter,  setCritFilter]  = useState<string>('all')
  const [catFilter,   setCatFilter]   = useState<string>('all')
  const [page,        setPage]        = useState(1)
  const LIMIT = 20

  const filters: ListAssetsFilters = {
    page,
    limit: LIMIT,
    ...(search.trim()           && { search:      search.trim() }),
    ...(statusFilter !== 'all'  && { status:      [statusFilter] }),
    ...(critFilter   !== 'all'  && { criticality: [critFilter] }),
    ...(catFilter    !== 'all'  && { categoryId:  catFilter }),
    ...(treeSelectedId          && { parentId:    treeSelectedId }),
  }

  const { data, isPending, error, refetch } = useAssets(filters)
  const { data: categories = [] } = useCategories()
  const createMutation = useCreateAsset()

  // ── Tree select → filter ───────────────────────────────────────────────────
  const handleTreeSelect = useCallback((node: AssetFlatNode) => {
    setTreeSelectedId((prev) => prev === node.id ? null : node.id)
    setPage(1)
  }, [])

  const handleAddChild = useCallback((node: AssetFlatNode) => {
    setNewChildParentId(node.id)
    setNewAssetOpen(true)
  }, [])

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
    const params = new URLSearchParams()
    if (search)              params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (critFilter !== 'all')   params.set('criticality', critFilter)
    if (catFilter !== 'all')    params.set('categoryId', catFilter)
    window.location.href = `${BASE}/assets/export?${params.toString()}`
  }

  // ── Import — opens the wizard ──────────────────────────────────────────────
  function handleImport() { setImportWizardOpen(true) }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Sidebar tree ─────────────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} shrink-0 border-r bg-card flex flex-col transition-all duration-200 overflow-hidden`}>
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Asset Tree</span>
          {treeSelectedId && (
            <button
              type="button"
              onClick={() => { setTreeSelectedId(null); setPage(1) }}
              className="text-xs text-primary hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden py-1">
          <AssetTreePanel
            selectedId={treeSelectedId}
            onSelect={handleTreeSelect}
            onAddChild={handleAddChild}
            className="h-full"
          />
        </div>
      </aside>

      {/* ── Sidebar toggle ────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        className="absolute left-64 top-1/2 z-10 -translate-y-1/2 flex h-6 w-4 items-center justify-center rounded-r border border-l-0 bg-card text-muted-foreground hover:bg-accent transition-all"
        style={{ marginLeft: sidebarOpen ? 0 : -256 }}
      >
        {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b bg-background px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search assets…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />Export
              </Button>
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Upload className="h-4 w-4 mr-1" />Import
              </Button>
              <Button onClick={() => { setNewChildParentId(undefined); setNewAssetOpen(true) }}>
                <Plus className="h-4 w-4 mr-1" />New Asset
              </Button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="OPERATIONAL">Operational</SelectItem>
                <SelectItem value="STANDBY">Standby</SelectItem>
                <SelectItem value="UNDER_MAINTENANCE">Under Maintenance</SelectItem>
                <SelectItem value="DECOMMISSIONED">Decommissioned</SelectItem>
              </SelectContent>
            </Select>

            <Select value={critFilter} onValueChange={(v) => { setCritFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Criticality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All criticality</SelectItem>
                <SelectItem value="A">A — Critical</SelectItem>
                <SelectItem value="B">B — High</SelectItem>
                <SelectItem value="C">C — Moderate</SelectItem>
                <SelectItem value="D">D — Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(statusFilter !== 'all' || critFilter !== 'all' || catFilter !== 'all' || search) && (
              <Button
                variant="ghost" size="sm" className="h-8 text-xs"
                onClick={() => { setStatusFilter('all'); setCritFilter('all'); setCatFilter('all'); setSearch(''); setPage(1) }}
              >
                Clear
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">{total} assets</span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isPending ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <p>Failed to load assets</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />Retry
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  {['Asset #', 'Name', 'Category', 'Location', 'Criticality', 'Status', 'MTBF', 'Open WOs', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((asset) => (
                  <AssetRow key={asset.id} asset={asset} />
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground text-sm">
                      No assets match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── New asset slide-over ──────────────────────────────────────────── */}
      <Sheet open={newAssetOpen} onOpenChange={setNewAssetOpen}>
        <SheetContent className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Asset</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <AssetForm
              {...(newChildParentId !== undefined && { parentId: newChildParentId })}
              onSubmit={async (values) => {
                await createMutation.mutateAsync(values as CreateAssetPayload)
                setNewAssetOpen(false)
              }}
              onCancel={() => setNewAssetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Bulk import wizard ────────────────────────────────────────────── */}
      <BulkImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onComplete={() => void refetch()}
      />

      {/* ── QR scanner FAB (mobile) ───────────────────────────────────────── */}
      <QRScannerModal />
    </div>
  )
}

// ── Table row ──────────────────────────────────────────────────────────────────

function AssetRow({ asset }: { asset: AssetCard }) {
  const router = useRouter()

  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => router.push(`/assets/${asset.id}`)}
    >
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{asset.assetNumber}</td>
      <td className="px-4 py-3">
        <div className="font-medium line-clamp-1">{asset.name}</div>
        {asset.manufacturer && (
          <div className="text-xs text-muted-foreground">{asset.manufacturer} {asset.model}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{asset.categoryName}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{asset.locationName ?? '—'}</td>
      <td className="px-4 py-3"><CriticalityBadge criticality={asset.criticality} /></td>
      <td className="px-4 py-3"><AssetStatusBadge status={asset.status} /></td>
      <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
      <td className="px-4 py-3">
        {asset.openWOCount > 0
          ? <Badge variant="destructive" className="text-xs">{asset.openWOCount}</Badge>
          : <span className="text-xs text-muted-foreground">0</span>
        }
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/assets/${asset.id}`}
          className="text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          View
        </Link>
      </td>
    </tr>
  )
}
