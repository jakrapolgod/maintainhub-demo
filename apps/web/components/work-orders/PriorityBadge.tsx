/**
 * PriorityBadge — icon + colour-coded badge for work-order priority levels.
 *
 * Each level gets a distinct icon and colour so colour-blind users can
 * distinguish priorities by shape as well as hue.
 *
 *   🔴 CRITICAL — red    (AlertOctagon)
 *   🟠 HIGH     — orange (ArrowUpCircle)
 *   🔵 MEDIUM   — blue   (MinusCircle)
 *   ⚪ LOW      — gray   (ArrowDownCircle)
 */
import { AlertOctagon, ArrowUpCircle, MinusCircle, ArrowDownCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WOPriority } from '@/lib/api/work-orders'

// ── Config ────────────────────────────────────────────────────────────────────

interface PriorityStyle {
  label: string
  Icon: LucideIcon
  classes: string
  iconCls: string
}

const PRIORITY_STYLES: Record<WOPriority, PriorityStyle> = {
  CRITICAL: {
    label: 'วิกฤต',
    Icon: AlertOctagon,
    classes: 'bg-red-50    text-red-700    border-red-200    dark:bg-red-950    dark:text-red-300',
    iconCls: 'text-red-600    dark:text-red-400',
  },
  HIGH: {
    label: 'สูง',
    Icon: ArrowUpCircle,
    classes:
      'bg-orange-50  text-orange-700  border-orange-200  dark:bg-orange-950  dark:text-orange-300',
    iconCls: 'text-orange-600  dark:text-orange-400',
  },
  MEDIUM: {
    label: 'ปานกลาง',
    Icon: MinusCircle,
    classes:
      'bg-blue-50    text-blue-700    border-blue-200    dark:bg-blue-950    dark:text-blue-300',
    iconCls: 'text-blue-600    dark:text-blue-400',
  },
  LOW: {
    label: 'ต่ำ',
    Icon: ArrowDownCircle,
    classes:
      'bg-slate-50   text-slate-600   border-slate-200   dark:bg-slate-800   dark:text-slate-300',
    iconCls: 'text-slate-500   dark:text-slate-400',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface PriorityBadgeProps {
  priority: WOPriority
  /** Show only the icon, no text label. */
  iconOnly?: boolean
  className?: string
  compact?: boolean
}

export function PriorityBadge({
  priority,
  iconOnly = false,
  className,
  compact = false,
}: PriorityBadgeProps) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM
  const { Icon } = style

  return (
    <span
      data-testid="priority-badge"
      data-priority={priority}
      title={style.label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        iconOnly && 'px-1.5',
        style.classes,
        className,
      )}
    >
      <Icon
        className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5', style.iconCls)}
        aria-hidden
      />
      {!iconOnly && style.label}
    </span>
  )
}
