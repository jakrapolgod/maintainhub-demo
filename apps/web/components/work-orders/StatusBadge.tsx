/**
 * StatusBadge — colour-coded badge for work-order status values.
 *
 * Design tokens map each status to a Tailwind colour pair so the badge
 * is legible in both light and dark mode without relying on the generic
 * Badge variant system.
 */
import { cn } from '@/lib/utils'
import type { WOStatus } from '@/lib/api/work-orders'

// ── Config ────────────────────────────────────────────────────────────────────

interface StatusStyle {
  label: string
  classes: string
}

const STATUS_STYLES: Record<WOStatus, StatusStyle> = {
  DRAFT: {
    label: 'ร่าง',
    classes:
      'bg-slate-100   text-slate-600   border-slate-200   dark:bg-slate-800  dark:text-slate-300',
  },
  OPEN: {
    label: 'เปิด',
    classes:
      'bg-blue-50     text-blue-700    border-blue-200    dark:bg-blue-950   dark:text-blue-300',
  },
  IN_PROGRESS: {
    label: 'กำลังดำเนินการ',
    classes:
      'bg-amber-50    text-amber-700   border-amber-200   dark:bg-amber-950  dark:text-amber-300',
  },
  ON_HOLD: {
    label: 'ระงับชั่วคราว',
    classes:
      'bg-violet-50   text-violet-700  border-violet-200  dark:bg-violet-950 dark:text-violet-300',
  },
  COMPLETED: {
    label: 'เสร็จสิ้น',
    classes:
      'bg-emerald-50  text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'ยกเลิก',
    classes:
      'bg-red-50      text-red-700     border-red-200     dark:bg-red-950    dark:text-red-300',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: WOStatus
  /** Optional extra Tailwind classes. */
  className?: string
  /** Render as a smaller pill when true. */
  compact?: boolean
}

export function StatusBadge({ status, className, compact = false }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT

  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        style.classes,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
