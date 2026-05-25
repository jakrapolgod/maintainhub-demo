'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Clock, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import {
  workOrders,
  getAssetById,
  type WOStatus,
  type WOPriority,
  type WorkOrder,
} from '@/lib/mock-data'
import { CreateWOSheet } from '@/components/work-orders/CreateWOSheet'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ── constants ──────────────────────────────────────────────────────────────────

// Priority indicator column background
const PRI_BG: Record<WOPriority, string> = {
  CRITICAL: 'bg-red-600',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-gray-300',
}

// Priority badge
const PRI: Record<WOPriority, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  LOW: 'bg-gray-100 text-gray-600',
}

// Status badge — updated palette
const STS: Record<WOStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  ON_HOLD: 'bg-gray-100 text-gray-600',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
}

const FILTER_LABELS: Record<string, string> = {
  ALL: 'All',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  DRAFT: 'Draft',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const STATUS_FILTERS = [
  'ALL',
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'DRAFT',
  'COMPLETED',
  'CANCELLED',
] as const
const PRI_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const KANBAN_COLS: WOStatus[] = ['OPEN', 'IN_PROGRESS', 'COMPLETED']
const today = new Date().toISOString().slice(0, 10)

function Chip({ v, map }: { v: string; map: Record<string, string> }) {
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', map[v])}>
      {v.replace('_', ' ')}
    </span>
  )
}

// Display id as "#0001" from "WO-2024-0001"
function shortId(id: string) {
  const m = id.match(/(\d+)$/)
  return m ? `#${m[1]}` : id
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const router = useRouter()
  const [localWOs, setLocalWOs] = useState<WorkOrder[]>(() => [...workOrders])
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL')
  const [priFilter, setPriFilter] = useState<(typeof PRI_FILTERS)[number]>('ALL')
  const [search, setSearch] = useState('')
  const [kanban, setKanban] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const rows = localWOs
    .filter((w) => filter === 'ALL' || w.status === filter)
    .filter((w) => priFilter === 'ALL' || w.priority === priFilter)
    .filter(
      (w) =>
        !search ||
        w.title.toLowerCase().includes(search.toLowerCase()) ||
        w.id.toLowerCase().includes(search.toLowerCase()),
    )

  function handleCreated(wo: WorkOrder) {
    const seq = String(localWOs.length + 1).padStart(4, '0')
    const newWO: WorkOrder = { ...wo, id: `WO-2024-${seq}` }
    setLocalWOs((prev) => [newWO, ...prev])
    toast.success(`✓ สร้าง ${newWO.id} แล้ว`)
  }

  const openSheet = () => setSheetOpen(true)

  // ── header ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold">Work Orders</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {localWOs.length}
          </span>
        </div>
        <button
          onClick={openSheet}
          data-tour="ai-panel"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="size-4" />
          New Work Order
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {PRI_FILTERS.map((p) => (
            <button
              key={p}
              onClick={() => setPriFilter(p)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                priFilter === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {p === 'ALL' ? 'All Priority' : p}
            </button>
          ))}
          <Input
            placeholder="Search title / WO #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-44 text-sm"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border">
          {(['Table', 'Kanban'] as const).map((v, i) => (
            <button
              key={v}
              onClick={() => setKanban(i === 1)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                kanban === (i === 1)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <ClipboardList className="size-12 text-muted-foreground" />
          <p className="text-lg font-medium">ไม่พบ Work Order</p>
          <p className="text-sm text-muted-foreground">
            ลองเปลี่ยนตัวกรอง หรือสร้าง Work Order ใหม่
          </p>
          <button
            onClick={openSheet}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="size-4" />+ สร้าง Work Order
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {!kanban && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-[3px] p-0" /> {/* priority indicator */}
              {['WO #', 'Title', 'Asset', 'Priority', 'Status', 'Due Date'].map((h) => (
                <th key={h} className="pb-2 pr-3 font-medium first:pl-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((wo) => {
              const isOverdue =
                wo.dueDate < today && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'
              const isCancelled = wo.status === 'CANCELLED'
              return (
                <tr
                  key={wo.id}
                  onClick={() => router.push(`/work-orders/${wo.id}`)}
                  className={cn(
                    'cursor-pointer transition-colors duration-150 hover:bg-muted/50',
                    isOverdue && 'text-red-600',
                  )}
                >
                  {/* Priority colour bar */}
                  <td className={cn('w-[3px] p-0', PRI_BG[wo.priority])} />
                  <td className="py-2 pl-2 pr-3 font-mono text-xs">{shortId(wo.id)}</td>
                  <td
                    className={cn(
                      'max-w-[200px] truncate py-2 pr-3',
                      isCancelled && 'opacity-50 line-through',
                    )}
                  >
                    {wo.title.slice(0, 40)}
                    {wo.title.length > 40 ? '…' : ''}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {getAssetById(wo.assetId)?.name ?? wo.assetId}
                  </td>
                  <td className="py-2 pr-3">
                    <Chip v={wo.priority} map={PRI} />
                  </td>
                  <td className="py-2 pr-3">
                    <Chip v={wo.status} map={STS} />
                  </td>
                  <td className="py-2 text-xs">
                    <span className="flex items-center gap-1">
                      {isOverdue && <Clock className="size-3 shrink-0" />}
                      {wo.dueDate}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ── Kanban ── */}
      {kanban && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KANBAN_COLS.map((col) => (
            <div key={col} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.replace('_', ' ')} ({rows.filter((w) => w.status === col).length})
              </p>
              {rows
                .filter((w) => w.status === col)
                .map((wo) => (
                  <div
                    key={wo.id}
                    onClick={() => router.push(`/work-orders/${wo.id}`)}
                    className="cursor-pointer space-y-1.5 rounded-lg border bg-card p-3 text-sm transition-colors duration-150 hover:bg-muted"
                  >
                    <p className="font-mono text-xs text-muted-foreground">{shortId(wo.id)}</p>
                    <p className="font-medium leading-snug">
                      {wo.title.slice(0, 40)}
                      {wo.title.length > 40 ? '…' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getAssetById(wo.assetId)?.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip v={wo.priority} map={PRI} />
                      <Chip v={wo.status} map={STS} />
                    </div>
                    <p
                      className={cn(
                        'text-xs',
                        wo.dueDate < today && wo.status !== 'COMPLETED'
                          ? 'text-red-600 font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      Due {wo.dueDate}
                    </p>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      <CreateWOSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
