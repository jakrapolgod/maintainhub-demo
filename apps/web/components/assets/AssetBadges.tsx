import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AssetStatus, Criticality } from '@/lib/api/assets'

// ── Criticality badge ─────────────────────────────────────────────────────────

const CRITICALITY_CONFIG: Record<Criticality, { label: string; color: string; dot: string }> = {
  A: {
    label: 'สำคัญยิ่ง',
    color: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  B: {
    label: 'ผลกระทบสูง',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  C: {
    label: 'ปานกลาง',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    dot: 'bg-yellow-500',
  },
  D: {
    label: 'ผลกระทบต่ำ',
    color: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
  },
}

interface CriticalityBadgeProps {
  criticality: Criticality
  /** When true, shows only the colored dot (for compact tree nodes). */
  dotOnly?: boolean
  className?: string
}

export function CriticalityBadge({ criticality, dotOnly, className }: CriticalityBadgeProps) {
  const cfg = CRITICALITY_CONFIG[criticality]

  if (dotOnly) {
    return (
      <span
        className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', cfg.dot, className)}
        title={`Criticality ${criticality} — ${cfg.label}`}
      />
    )
  }

  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', cfg.color, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {criticality}
    </Badge>
  )
}

// ── Asset status badge ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AssetStatus, { label: string; color: string }> = {
  OPERATIONAL: {
    label: 'ใช้งานปกติ',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  STANDBY: { label: 'สำรอง', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  UNDER_MAINTENANCE: {
    label: 'กำลังซ่อมบำรุง',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  DECOMMISSIONED: { label: 'ปลดระวาง', color: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

interface AssetStatusBadgeProps {
  status: AssetStatus
  className?: string
}

export function AssetStatusBadge({ status, className }: AssetStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', cfg.color, className)}>
      {cfg.label}
    </Badge>
  )
}
