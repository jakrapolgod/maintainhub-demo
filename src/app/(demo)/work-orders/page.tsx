'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { workOrders, getAssetById, type WOStatus, type WOPriority } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const PRI: Record<WOPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-amber-500 text-white',
  MEDIUM: 'bg-blue-500 text-white',
  LOW: 'bg-gray-400 text-white',
}
const STS: Record<WOStatus, string> = {
  OPEN: 'bg-gray-200 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
}
const COLS: WOStatus[] = ['OPEN', 'IN_PROGRESS', 'COMPLETED']
const FILTER_LABELS: Record<string, string> = {
  ALL: 'All',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}
const woNum = (id: string) =>
  `WO-${String(workOrders.findIndex((w) => w.id === id) + 1).padStart(3, '0')}`
const today = new Date().toISOString().slice(0, 10)
const Chip = ({ v, map }: { v: string; map: Record<string, string> }) => (
  <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', map[v])}>
    {v.replace('_', ' ')}
  </span>
)

export default function WorkOrdersPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<'ALL' | WOStatus>('ALL')
  const [kanban, setKanban] = useState(false)
  const rows = filter === 'ALL' ? workOrders : workOrders.filter((w) => w.status === filter)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Work Orders</h2>
        <Button size="sm" onClick={() => {}} data-tour="ai-panel">
          <Plus className="mr-1.5 size-4" />
          New WO
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED'] as const).map((f) => (
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

      {/* Table */}
      {!kanban && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {['WO #', 'Title', 'Asset', 'Priority', 'Status', 'Due Date'].map((h) => (
                <th key={h} className="pb-2 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((wo) => (
              <tr
                key={wo.id}
                onClick={() => router.push(`/work-orders/${wo.id}`)}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <td className="py-2 pr-3 font-mono text-xs">{woNum(wo.id)}</td>
                <td className="py-2 pr-3 max-w-[200px] truncate">
                  {wo.title.slice(0, 40)}
                  {wo.title.length > 40 ? '…' : ''}
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {getAssetById(wo.assetId)?.name}
                </td>
                <td className="py-2 pr-3">
                  <Chip v={wo.priority} map={PRI} />
                </td>
                <td className="py-2 pr-3">
                  <Chip v={wo.status} map={STS} />
                </td>
                <td
                  className={cn(
                    'py-2 text-xs',
                    wo.dueDate < today && wo.status !== 'COMPLETED'
                      ? 'text-red-600 font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {wo.dueDate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Kanban */}
      {kanban && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLS.map((col) => (
            <div key={col} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.replace('_', ' ')} ({workOrders.filter((w) => w.status === col).length})
              </p>
              {workOrders
                .filter((w) => w.status === col)
                .map((wo) => (
                  <div
                    key={wo.id}
                    draggable
                    onClick={() => router.push(`/work-orders/${wo.id}`)}
                    className="cursor-pointer space-y-1.5 rounded-lg border bg-card p-3 text-sm hover:bg-muted"
                  >
                    <p className="font-mono text-xs text-muted-foreground">{woNum(wo.id)}</p>
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
    </div>
  )
}
