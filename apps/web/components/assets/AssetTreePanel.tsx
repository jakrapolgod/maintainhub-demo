'use client'

/**
 * AssetTreePanel — collapsible hierarchy tree with:
 *   - Virtualized rendering via @tanstack/react-virtual (handles 1000+ nodes)
 *   - Drag-and-drop reparenting via @dnd-kit
 *   - Keyboard navigation (↑↓ arrow keys, Enter to expand/collapse)
 *   - Criticality color dot, open WO badge, hover "Add child" button
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, ChevronDown, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CriticalityBadge } from './AssetBadges'
import { useAssetTree, useTransferAsset } from '@/hooks/useAssets'
import type { AssetFlatNode } from '@/lib/api/assets'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssetTreePanelProps {
  /** When set, only render the subtree rooted here. */
  rootAssetId?: string
  /** Currently selected asset — highlights the row. */
  selectedId?: string | null
  onSelect: (node: AssetFlatNode) => void
  /** Called when user clicks "Add child" on a node. */
  onAddChild?: (parentNode: AssetFlatNode) => void
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetTreePanel({
  rootAssetId,
  selectedId,
  onSelect,
  onAddChild,
  className,
}: AssetTreePanelProps) {
  const { data, isPending, error, refetch } = useAssetTree(rootAssetId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Flatten tree with expansion state ────────────────────────────────────

  const flatVisible = useMemo<AssetFlatNode[]>(() => {
    if (!data?.flat) return []
    // Show nodes whose entire ancestor chain is expanded
    const visible: AssetFlatNode[] = []
    for (const node of data.flat) {
      if (node.depth === 0) {
        visible.push(node)
      } else {
        // Parent must be in visible and expanded
        const parentId = node.parentId
        const parentVisible = parentId ? visible.some((v) => v.id === parentId) : false
        const parentExpanded = parentId ? expanded.has(parentId) : false
        if (parentVisible && parentExpanded) visible.push(node)
      }
    }
    return visible
  }, [data?.flat, expanded])

  // Auto-expand first level on load
  useEffect(() => {
    if (data?.flat && expanded.size === 0) {
      const roots = data.flat.filter((n) => n.depth === 0).map((n) => n.id)
      setExpanded(new Set(roots))
    }
  }, [data?.flat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Virtualizer ───────────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: flatVisible.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((i) => Math.min(i + 1, flatVisible.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focusedIdx >= 0 && focusedIdx < flatVisible.length) {
          const node = flatVisible[focusedIdx]!
          const hasChildren = data?.flat.some((n) => n.parentId === node.id)
          if (hasChildren) {
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(node.id)) next.delete(node.id)
              else next.add(node.id)
              return next
            })
          }
          onSelect(node)
        }
      }
    },
    [flatVisible, focusedIdx, data?.flat, onSelect],
  )

  // ── DnD sensors ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // transferMutation is keyed to activeId; drag end fires before activeId clears
  const transferMutation = useTransferAsset(activeId ?? '')

  function handleDragStart(ev: DragStartEvent) {
    setActiveId(String(ev.active.id))
  }

  function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) {
      setActiveId(null)
      return
    }

    const newParentId = String(over.id)
    const parent = data?.flat.find((n) => n.id === newParentId)
    if (!parent) {
      setActiveId(null)
      return
    }

    // transferMutation is already keyed to active.id (set in handleDragStart)
    transferMutation.mutate({
      newLocationId: parent.locationId ?? '',
      newParentId,
    })
    setActiveId(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isPending) {
    return (
      <div className={cn('p-2 space-y-1', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-8 w-full rounded"
            style={{ marginLeft: `${(i % 3) * 12}px` }}
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-2 p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        <AlertTriangle className="h-5 w-5" />
        <span>Failed to load asset tree</span>
        <button onClick={() => refetch()} className="text-primary hover:underline text-xs">
          Retry
        </button>
      </div>
    )
  }

  const activeNode = activeId ? data?.flat.find((n) => n.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={containerRef}
        role="tree"
        aria-label="Asset hierarchy"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn('overflow-auto outline-none', className)}
        style={{ height: '100%' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const node = flatVisible[virtualRow.index]!
            const hasChildren = data?.flat.some((n) => n.parentId === node.id) ?? false
            const isExpanded = expanded.has(node.id)
            const isFocused = focusedIdx === virtualRow.index
            const isSelected = selectedId === node.id

            return (
              <TreeRow
                key={node.id}
                node={node}
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                isFocused={isFocused}
                isSelected={isSelected}
                virtualIndex={virtualRow.index}
                virtualStart={virtualRow.start}
                virtualSize={virtualRow.size}
                onToggleExpand={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(node.id)) next.delete(node.id)
                    else next.add(node.id)
                    return next
                  })
                }
                onSelect={() => {
                  setFocusedIdx(virtualRow.index)
                  onSelect(node)
                }}
                {...(onAddChild !== undefined && { onAddChild: () => onAddChild(node) })}
              />
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {activeNode && (
          <div className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs shadow-lg opacity-90">
            <CriticalityBadge criticality={activeNode.criticality} dotOnly />
            <span className="font-mono text-muted-foreground">{activeNode.assetNumber}</span>
            <span className="truncate max-w-[160px]">{activeNode.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ── TreeRow ────────────────────────────────────────────────────────────────────

interface TreeRowProps {
  node: AssetFlatNode
  hasChildren: boolean
  isExpanded: boolean
  isFocused: boolean
  isSelected: boolean
  virtualIndex: number
  virtualStart: number
  virtualSize: number
  onToggleExpand: () => void
  onSelect: () => void
  onAddChild?: () => void
}

function TreeRow({
  node,
  hasChildren,
  isExpanded,
  isFocused,
  isSelected,
  virtualStart,
  virtualSize,
  onToggleExpand,
  onSelect,
  onAddChild,
}: TreeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const style = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: `${virtualSize}px`,
    transform: `translateY(${virtualStart}px) ${CSS.Transform.toString(transform) ?? ''}`,
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
      className={cn(
        'group flex items-center gap-1 px-1 rounded-md cursor-pointer select-none',
        'hover:bg-accent/60 transition-colors',
        isSelected && 'bg-primary/10 text-primary',
        isFocused && 'ring-1 ring-ring',
      )}
      onClick={onSelect}
    >
      {/* Indentation */}
      <span style={{ width: node.depth * 16 }} aria-hidden />

      {/* Expand/collapse toggle */}
      <button
        type="button"
        className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation()
          if (hasChildren) onToggleExpand()
        }}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
        tabIndex={-1}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )
        ) : (
          <span className="h-3 w-3" />
        )}
      </button>

      {/* Drag handle + criticality dot */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-accent"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reparent"
      >
        <CriticalityBadge criticality={node.criticality} dotOnly />
      </button>

      {/* Asset number + name */}
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {node.assetNumber}
      </span>
      <span className="truncate text-xs flex-1">{node.name}</span>

      {/* Open WO badge */}
      {node.openWOCount > 0 && (
        <Badge variant="destructive" className="h-4 px-1 text-[9px] shrink-0">
          {node.openWOCount}
        </Badge>
      )}

      {/* Add child (hover) */}
      {onAddChild && (
        <button
          type="button"
          className="h-4 w-4 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onAddChild()
          }}
          title="Add child asset"
          tabIndex={-1}
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  )
}
