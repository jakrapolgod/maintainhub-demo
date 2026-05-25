'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { assets, workOrders, type CriticalityClass } from '@/lib/mock-data'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

const openWOCount = (assetId: string) =>
  workOrders.filter((w) => w.assetId === assetId && w.status !== 'COMPLETED').length

const CRIT_DOT: Record<CriticalityClass, string> = {
  A: 'bg-red-500',
  B: 'bg-amber-500',
  C: 'bg-green-500',
}

// ── tree data ─────────────────────────────────────────────────────────────────
// Groups assets by parentId hierarchy: SYSTEM nodes become group branches,
// EQUIPMENT nodes become leaves under their parent SYSTEM.

type AssetLeaf = { kind: 'asset'; assetId: string }
type GroupBranch = { kind: 'group'; id: string; label: string; children: AssetLeaf[] }
type RootNode = { kind: 'root'; children: GroupBranch[] }

const systemGroups: GroupBranch[] = assets
  .filter((a) => a.nodeType === 'SYSTEM')
  .map((a) => ({
    kind: 'group' as const,
    id: a.id,
    label: a.name,
    children: assets
      .filter((child) => child.parentId === a.id)
      .map((child) => ({ kind: 'asset' as const, assetId: child.id })),
  }))

const standaloneEquipment = assets.filter((a) => a.nodeType === 'EQUIPMENT' && !a.parentId)

const GROUPS: GroupBranch[] = [
  ...systemGroups,
  ...(standaloneEquipment.length > 0
    ? [
        {
          kind: 'group' as const,
          id: 'standalone',
          label: 'Standalone',
          children: standaloneEquipment.map((a) => ({
            kind: 'asset' as const,
            assetId: a.id,
          })),
        },
      ]
    : []),
]

const ROOT: RootNode = { kind: 'root', children: GROUPS }

// ── exported filter value ─────────────────────────────────────────────────────
// null = show all, string = assetId (single) or groupId (multiple)

export type TreeSelection =
  | { type: 'asset'; assetId: string }
  | { type: 'group'; assetIds: string[] }
  | null

// ── sub-components ────────────────────────────────────────────────────────────

function AssetRow({
  assetId,
  selected,
  onClick,
}: {
  assetId: string
  selected: boolean
  onClick: () => void
}) {
  const router = useRouter()
  const asset = assets.find((a) => a.id === assetId)
  if (!asset) return null
  const wos = openWOCount(assetId)

  return (
    <button
      onClick={() => {
        onClick()
        router.push(`/assets/${assetId}`)
      }}
      className={cn(
        'group relative flex w-full cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-l-primary bg-primary/10 font-medium text-primary'
          : 'border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {/* criticality dot */}
      <span className={cn('size-2 shrink-0 rounded-full', CRIT_DOT[asset.criticality])} />
      {/* tag + name — single truncating line */}
      <span className="min-w-0 max-w-[140px] truncate text-sm transition-all duration-150 group-hover:font-semibold">
        <span className="font-mono text-muted-foreground">{asset.tag}</span> {asset.name}
      </span>
      {/* open WO badge */}
      {wos > 0 && (
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] leading-4">
          {wos}
        </Badge>
      )}
      {/* chevron fades in on hover */}
      <ChevronRight className="size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
    </button>
  )
}

function GroupRow({
  group,
  open,
  selected,
  onToggle,
  onClick,
}: {
  group: GroupBranch
  open: boolean
  selected: boolean
  onToggle: () => void
  onClick: () => void
}) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="flex items-center gap-0.5">
      {/* expand/collapse chevron */}
      <button
        onClick={onToggle}
        className="rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <Chevron className="size-3.5" />
      </button>
      {/* group label */}
      <button
        onClick={onClick}
        className={cn(
          'group flex-1 cursor-pointer rounded-md px-1.5 py-1 text-left text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
        )}
      >
        <span className="transition-all duration-150 group-hover:font-semibold">{group.label}</span>
      </button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export interface AssetTreeProps {
  selection: TreeSelection
  onSelect: (sel: TreeSelection) => void
}

export function AssetTree({ selection, onSelect }: AssetTreeProps) {
  // all groups start expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g.id, true])),
  )

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function isAssetSelected(assetId: string) {
    if (!selection) return false
    if (selection.type === 'asset') return selection.assetId === assetId
    if (selection.type === 'group') return selection.assetIds.includes(assetId)
    return false
  }

  function isGroupSelected(group: GroupBranch) {
    if (!selection || selection.type !== 'group') return false
    return selection.assetIds.join(',') === group.children.map((c) => c.assetId).join(',')
  }

  function handleAllClick() {
    onSelect(null)
  }

  function handleGroupClick(group: GroupBranch) {
    onSelect({ type: 'group', assetIds: group.children.map((c) => c.assetId) })
  }

  function handleAssetClick(assetId: string) {
    onSelect({ type: 'asset', assetId })
  }

  const allSelected = selection === null

  return (
    <nav className="space-y-1">
      {/* "All Assets" root */}
      <button
        onClick={handleAllClick}
        className={cn(
          'group flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          allSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
        )}
      >
        <span className="flex-1">All Assets</span>
        <ChevronRight className="size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </button>

      {/* groups */}
      {ROOT.children.map((group) => (
        <div key={group.id} className="pl-1">
          <GroupRow
            group={group}
            open={!!expanded[group.id]}
            selected={isGroupSelected(group)}
            onToggle={() => toggle(group.id)}
            onClick={() => handleGroupClick(group)}
          />
          {expanded[group.id] && (
            <div className="ml-5 mt-0.5 space-y-0.5">
              {group.children.map((leaf) => (
                <AssetRow
                  key={leaf.assetId}
                  assetId={leaf.assetId}
                  selected={isAssetSelected(leaf.assetId)}
                  onClick={() => handleAssetClick(leaf.assetId)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
