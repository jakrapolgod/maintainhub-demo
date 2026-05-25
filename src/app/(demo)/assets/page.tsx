'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assets, workOrders, type AssetStatus, type CriticalityClass } from '@/lib/mock-data'
import { AssetTree, type TreeSelection } from '@/components/assets/AssetTree'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

function categoryFromName(name: string): string {
  // e.g. "Pump P-001" → "Pump", "Cooling Tower CT-004" → "Cooling Tower"
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

// ── asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: (typeof assets)[number] }) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const lastWO = lastWODate(asset.id)
  const category = categoryFromName(asset.name)

  return (
    <div
      className="relative rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* header row */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{asset.tag}</p>
          <p className="mt-0.5 truncate font-semibold leading-snug">{asset.name}</p>
        </div>
        {/* category badge */}
        <Badge variant="outline" className="shrink-0 text-xs">
          {category}
        </Badge>
      </div>

      {/* status */}
      <span
        className={cn(
          'inline-block rounded px-1.5 py-0.5 text-xs font-medium',
          STATUS_CLASS[asset.status],
        )}
      >
        {STATUS_LABEL[asset.status]}
      </span>

      {/* criticality + last WO */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', CRIT_DOT[asset.criticality])} />
          <span>
            Class {asset.criticality} — {CRIT_LABEL[asset.criticality]}
          </span>
        </div>
        {lastWO && <span>Last WO: {lastWO}</span>}
      </div>

      {/* hover "View" button */}
      {hovered && (
        <div className="absolute inset-0 flex items-end justify-end rounded-lg bg-background/60 p-3 backdrop-blur-sm">
          <Button size="sm" onClick={() => router.push(`/assets/${asset.id}`)}>
            View
          </Button>
        </div>
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
