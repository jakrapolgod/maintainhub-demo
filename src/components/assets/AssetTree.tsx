"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { assets, workOrders, type CriticalityClass } from "@/lib/mock-data"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────────────────────

const openWOCount = (assetId: string) =>
  workOrders.filter((w) => w.assetId === assetId && w.status !== "COMPLETED").length

const CRIT_DOT: Record<CriticalityClass, string> = {
  A: "bg-red-500",
  B: "bg-amber-500",
  C: "bg-green-500",
}

// ── tree data ─────────────────────────────────────────────────────────────────
// Groups assets by site/location into a two-level hierarchy.

type AssetLeaf = { kind: "asset"; assetId: string }
type GroupBranch = { kind: "group"; id: string; label: string; children: AssetLeaf[] }
type RootNode = { kind: "root"; children: GroupBranch[] }

const GROUPS: GroupBranch[] = [
  { kind: "group", id: "b1",  label: "Building 1",    children: [{ kind: "asset", assetId: "a1" }, { kind: "asset", assetId: "a2" }] },
  { kind: "group", id: "b2",  label: "Building 2",    children: [{ kind: "asset", assetId: "a5" }] },
  { kind: "group", id: "wha", label: "Warehouse A",   children: [{ kind: "asset", assetId: "a3" }] },
  { kind: "group", id: "ext", label: "External",      children: [{ kind: "asset", assetId: "a4" }] },
]

const ROOT: RootNode = { kind: "root", children: GROUPS }

// ── exported filter value ─────────────────────────────────────────────────────
// null = show all, string = assetId (single) or groupId (multiple)

export type TreeSelection = { type: "asset"; assetId: string } | { type: "group"; assetIds: string[] } | null

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
  const asset = assets.find((a) => a.id === assetId)
  if (!asset) return null
  const wos = openWOCount(assetId)

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {/* criticality dot */}
      <span className={cn("size-2 shrink-0 rounded-full", CRIT_DOT[asset.criticality])} />
      {/* tag */}
      <span className="font-mono text-xs text-muted-foreground shrink-0">{asset.tag}</span>
      {/* name */}
      <span className="min-w-0 flex-1 truncate">{asset.name}</span>
      {/* open WO badge */}
      {wos > 0 && (
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] leading-4">
          {wos}
        </Badge>
      )}
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
        className="rounded p-0.5 text-muted-foreground hover:bg-muted"
        aria-label={open ? "Collapse" : "Expand"}
      >
        <Chevron className="size-3.5" />
      </button>
      {/* group label */}
      <button
        onClick={onClick}
        className={cn(
          "flex-1 rounded-md px-1.5 py-1 text-left text-sm font-medium transition-colors",
          selected
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-muted"
        )}
      >
        {group.label}
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
    Object.fromEntries(GROUPS.map((g) => [g.id, true]))
  )

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function isAssetSelected(assetId: string) {
    if (!selection) return false
    if (selection.type === "asset") return selection.assetId === assetId
    if (selection.type === "group") return selection.assetIds.includes(assetId)
    return false
  }

  function isGroupSelected(group: GroupBranch) {
    if (!selection || selection.type !== "group") return false
    return selection.assetIds.join(",") === group.children.map((c) => c.assetId).join(",")
  }

  function handleAllClick() {
    onSelect(null)
  }

  function handleGroupClick(group: GroupBranch) {
    onSelect({ type: "group", assetIds: group.children.map((c) => c.assetId) })
  }

  function handleAssetClick(assetId: string) {
    onSelect({ type: "asset", assetId })
  }

  const allSelected = selection === null

  return (
    <nav className="space-y-1">
      {/* "All Assets" root */}
      <button
        onClick={handleAllClick}
        className={cn(
          "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm font-semibold transition-colors",
          allSelected
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-muted"
        )}
      >
        All Assets
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
