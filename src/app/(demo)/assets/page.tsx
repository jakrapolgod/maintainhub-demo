'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assets, workOrders, type AssetStatus, type CriticalityClass } from '@/lib/mock-data'
import { AssetTree, type TreeSelection } from '@/components/assets/AssetTree'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

function categoryFromName(name: string): string {
  const match = name.match(/^([A-Za-z ]+?)\s+[A-Z]+-\d+/)
  return match ? match[1].trim() : name
}

function lastWODate(assetId: string): string | null {
  const dates = workOrders
    .filter((w) => w.assetId === assetId)
    .map((w) => w.completedAt ?? w.createdAt)
    .sort()
    .reverse()
  return dates[0] ?? null
}

function openWOCount(assetId: string): number {
  return workOrders.filter(
    (w) => w.assetId === assetId && w.status !== 'COMPLETED' && w.status !== 'CANCELLED',
  ).length
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  OPERATIONAL: 'OPERATIONAL',
  UNDER_MAINTENANCE: 'IN MAINTENANCE',
  STANDBY: 'STANDBY',
  DECOMMISSIONED: 'DECOMMISSIONED',
}

const STATUS_CLASS: Record<AssetStatus, string> = {
  OPERATIONAL: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  UNDER_MAINTENANCE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  STANDBY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DECOMMISSIONED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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

// ── asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: (typeof assets)[number] }) {
  const router = useRouter()
  const lastWO = lastWODate(asset.id)
  const category = categoryFromName(asset.name)
  const parentName = asset.parentId ? assets.find((a) => a.id === asset.parentId)?.name : null
  const openCount = openWOCount(asset.id)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/assets/${asset.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') router.push(`/assets/${asset.id}`)
      }}
      className="group relative cursor-pointer overflow-hidden rounded-xl border bg-card p-4 transition-all duration-150 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* left accent border — scales in on hover */}
      <div className="absolute inset-y-0 left-0 w-[3px] origin-center scale-y-0 bg-primary transition-transform duration-150 group-hover:scale-y-100" />

      {/* header: tag code + status badge */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{asset.tag}</span>
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_CLASS[asset.status])}>
          {STATUS_LABEL[asset.status]}
        </span>
      </div>

      {/* asset name — one line only */}
      <h3 className="mb-0.5 truncate text-sm font-medium leading-snug">{asset.name}</h3>

      {/* subtitle: category • parent system */}
      <p className="mb-3 truncate text-xs text-muted-foreground">
        {category}
        {parentName ? ` • ${parentName}` : ''}
      </p>

      <hr className="mb-3 border-border/50" />

      {/* criticality + open WO count */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-2 shrink-0 rounded-full', CRIT_DOT[asset.criticality])} />
          <span>
            Class {asset.criticality} — {CRIT_LABEL[asset.criticality]}
          </span>
        </div>
        {openCount > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {openCount} open WO{openCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* last WO date */}
      {lastWO && (
        <p className="text-xs text-muted-foreground">งาน WO ล่าสุด: {formatThaiDate(lastWO)}</p>
      )}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [selection, setSelection] = useState<TreeSelection>(null)

  // filter assets based on tree selection
  const filtered = (() => {
    if (!selection) return assets
    if (selection.type === 'asset') return assets.filter((a) => a.id === selection.assetId)
    return assets.filter((a) => selection.assetIds.includes(a.id))
  })()

  return (
    <div className="flex gap-6">
      {/* ── Left: asset tree ── */}
      <aside className="hidden w-52 shrink-0 lg:block" data-tour="asset-tree">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Asset Hierarchy
        </p>
        <AssetTree selection={selection} onSelect={setSelection} />
      </aside>

      {/* ── Right: asset cards ── */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
          </p>
          {selection && (
            <button
              onClick={() => setSelection(null)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear filter
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No assets found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
