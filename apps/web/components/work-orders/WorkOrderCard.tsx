/**
 * WorkOrderCard — compact card used in Kanban columns and list grids.
 *
 * Visual anatomy:
 *   ┌─[priority strip]────────────────────────────────┐
 *   │  WO-2024-000001 · CORRECTIVE    [STATUS BADGE]  │
 *   │  Fix pump P-101 mechanical seal                  │
 *   │  Pump P-101 — Building A                         │
 *   │  [avatars ×3 +2]                  Due: Jun 10 ⚠ │
 *   └──────────────────────────────────────────────────┘
 *
 * The left border strip colour matches the priority level for instant
 * visual triage at a glance.
 */
import { isAfter } from 'date-fns'
import { formatThaiDateShort } from '@/lib/formatThaiDate'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { AssigneeAvatars } from './assignee-avatars'
import type { WorkOrderSummary, WOPriority } from '@/lib/api/work-orders'

// ── Priority border colours ────────────────────────────────────────────────────

const PRIORITY_BORDER: Record<WOPriority, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-orange-500',
  MEDIUM: 'border-l-blue-500',
  LOW: 'border-l-slate-300',
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkOrderCardProps {
  /** The work-order summary data. */
  wo: WorkOrderSummary
  /** Called when the card body is clicked. */
  onClick?: () => void
  /** When true the card renders without hover/cursor styles (e.g. inside a drag overlay). */
  static?: boolean
  /** Extra Tailwind classes applied to the outer wrapper. */
  className?: string
  /** Test helper — rendered as data-testid. */
  testId?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkOrderCard({
  wo,
  onClick,
  static: isStatic = false,
  className,
  testId,
}: WorkOrderCardProps) {
  const isOverdue = Boolean(
    wo.slaDeadline &&
    wo.status !== 'COMPLETED' &&
    wo.status !== 'CANCELLED' &&
    isAfter(new Date(), new Date(wo.slaDeadline)),
  )

  const borderColour = PRIORITY_BORDER[wo.priority] ?? PRIORITY_BORDER.MEDIUM

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={testId ?? 'work-order-card'}
      data-wo-id={wo.id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick()
      }}
      className={cn(
        'rounded-lg border bg-card border-l-4 p-3 shadow-sm',
        borderColour,
        !isStatic &&
          'cursor-pointer select-none transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isOverdue && 'ring-1 ring-destructive/40',
        className,
      )}
    >
      {/* Row 1: WO number + status */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{wo.woNumber}</span>
        <StatusBadge status={wo.status} compact />
      </div>

      {/* Row 2: Title */}
      <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1">{wo.title}</p>

      {/* Row 3: Asset name */}
      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{wo.assetName}</p>

      {/* Row 4: Assignees + due date */}
      <div className="flex items-center justify-between gap-2">
        <AssigneeAvatars assignees={wo.assignees} max={3} size="sm" />

        <div className="flex items-center gap-2 shrink-0">
          <PriorityBadge priority={wo.priority} iconOnly compact />

          {wo.dueDate && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-[11px]',
                isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
              title={isOverdue ? 'เกิน SLA' : undefined}
            >
              <Calendar className="h-3 w-3" aria-hidden />
              {formatThaiDateShort(wo.dueDate)}
              {isOverdue && ' ⚠'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
