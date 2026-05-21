/**
 * Reusable badge components for WO status and priority.
 * Used across list, detail, and kanban views.
 */
import { Badge } from '@/components/ui/badge'
import type { WOStatus, WOPriority } from '@/lib/api/work-orders'

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WOStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'info' | 'destructive'
  }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  OPEN: { label: 'Open', variant: 'info' },
  IN_PROGRESS: { label: 'In Progress', variant: 'warning' },
  ON_HOLD: { label: 'On Hold', variant: 'outline' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

export function StatusBadge({ status }: { status: WOStatus }) {
  const { label, variant } = STATUS_CONFIG[status] ?? {
    label: status,
    variant: 'secondary' as const,
  }
  return <Badge variant={variant}>{label}</Badge>
}

// ── Priority badge ────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
  WOPriority,
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'info' | 'destructive'
    dot: string
  }
> = {
  CRITICAL: { label: 'Critical', variant: 'destructive', dot: 'bg-red-500' },
  HIGH: { label: 'High', variant: 'warning', dot: 'bg-orange-500' },
  MEDIUM: { label: 'Medium', variant: 'info', dot: 'bg-blue-500' },
  LOW: { label: 'Low', variant: 'secondary', dot: 'bg-gray-400' },
}

export function PriorityBadge({ priority }: { priority: WOPriority }) {
  const { label, variant, dot } = PRIORITY_CONFIG[priority] ?? {
    label: priority,
    variant: 'secondary' as const,
    dot: 'bg-gray-400',
  }
  return (
    <Badge variant={variant} className="gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </Badge>
  )
}

// ── WO type label ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CORRECTIVE: 'Corrective',
  PREVENTIVE: 'Preventive',
  INSPECTION: 'Inspection',
  EMERGENCY: 'Emergency',
}

export function TypeLabel({ type }: { type: string }) {
  return <span className="text-xs text-muted-foreground">{TYPE_LABELS[type] ?? type}</span>
}
