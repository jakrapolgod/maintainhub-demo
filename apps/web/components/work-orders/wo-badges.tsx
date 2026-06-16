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
  DRAFT: { label: 'ร่าง', variant: 'secondary' },
  OPEN: { label: 'เปิด', variant: 'info' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', variant: 'warning' },
  ON_HOLD: { label: 'ระงับชั่วคราว', variant: 'outline' },
  COMPLETED: { label: 'เสร็จสิ้น', variant: 'success' },
  CANCELLED: { label: 'ยกเลิก', variant: 'destructive' },
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
  CRITICAL: { label: 'วิกฤต', variant: 'destructive', dot: 'bg-red-500' },
  HIGH: { label: 'สูง', variant: 'warning', dot: 'bg-orange-500' },
  MEDIUM: { label: 'ปานกลาง', variant: 'info', dot: 'bg-blue-500' },
  LOW: { label: 'ต่ำ', variant: 'secondary', dot: 'bg-gray-400' },
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
  CORRECTIVE: 'งานแก้ไข',
  PREVENTIVE: 'งานป้องกัน',
  INSPECTION: 'งานตรวจสอบ',
  EMERGENCY: 'งานฉุกเฉิน',
}

export function TypeLabel({ type }: { type: string }) {
  return <span className="text-xs text-muted-foreground">{TYPE_LABELS[type] ?? type}</span>
}
