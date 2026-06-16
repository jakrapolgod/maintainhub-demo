'use client'

/**
 * AssetAttentionWidget — dashboard card showing the top 5 assets that need
 * immediate attention.
 *
 * Attention reasons (with matching badge colours):
 *   OVERDUE_PM         → red     — PM schedule past due date
 *   WARRANTY_EXPIRING  → amber   — warranty expires within 30 days
 *   HIGH_MTTR          → orange  — average repair time exceeds threshold
 *   OPEN_EMERGENCY_WO  → purple  — open EMERGENCY work order exists
 *
 * Clicking any row navigates to the asset detail page.
 */
import Link from 'next/link'
import { format, differenceInDays, isValid } from 'date-fns'
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  Wrench,
  ChevronRight,
  RefreshCw,
  Loader2,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { CriticalityBadge } from './AssetBadges'
import { useAssetsAttention } from '@/hooks/useAssets'
import type { AttentionReason, AssetCard } from '@/lib/api/assets'

// ── Reason config ─────────────────────────────────────────────────────────────

const REASON_CONFIG: Record<
  AttentionReason,
  {
    label: string
    icon: React.ElementType
    color: string
  }
> = {
  OVERDUE_PM: {
    label: 'PM เกินกำหนด',
    icon: Clock,
    color: 'bg-red-100 text-red-700 border-red-200',
  },
  WARRANTY_EXPIRING: {
    label: 'การรับประกันใกล้หมด',
    icon: ShieldAlert,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  HIGH_MTTR: {
    label: 'อัตราความเสียสูง',
    icon: Wrench,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  OPEN_EMERGENCY_WO: {
    label: 'ใบสั่งงานฉุกเฉินเปิดอยู่',
    icon: AlertTriangle,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AssetAttentionWidgetProps {
  /** Max items shown. @default 5 */
  limit?: number
  className?: string
}

export function AssetAttentionWidget({ limit = 5, className }: AssetAttentionWidgetProps) {
  const { data, isPending, error, refetch } = useAssetsAttention()

  const items = (data?.items ?? []).slice(0, limit)

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          สินทรัพย์ที่ต้องดูแล
          {data?.totalCount ? (
            <Badge variant="destructive" className="text-xs h-5 px-1.5">
              {data.totalCount}
            </Badge>
          ) : null}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-1 p-3 pt-0">
        {isPending &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            โหลดข้อมูลไม่สำเร็จ
          </div>
        )}

        {!isPending && !error && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-700">ทุกอย่างปกติดี</p>
            <p className="text-xs text-muted-foreground">ไม่มีสินทรัพย์ที่ต้องดูแลเร่งด่วน</p>
          </div>
        )}

        {items.map((item) => (
          <AttentionRow key={item.asset.id} item={item} />
        ))}

        {(data?.totalCount ?? 0) > limit && (
          <Link
            href="/assets?hasOpenWOs=true"
            className="flex items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ดูทั้งหมด {data?.totalCount} สินทรัพย์
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// ── AttentionRow ───────────────────────────────────────────────────────────────

interface AttentionItem {
  asset: AssetCard
  reasons: AttentionReason[]
  dueDate: string | null
  mttrHours: number | null
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { asset, reasons, dueDate, mttrHours } = item
  const primaryReason = reasons[0]!
  const cfg = REASON_CONFIG[primaryReason]

  // Human-readable context line
  const contextLine = buildContextLine(primaryReason, dueDate, mttrHours)

  return (
    <Link
      href={`/assets/${asset.id}`}
      className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-accent/60 transition-colors"
    >
      {/* Criticality dot */}
      <CriticalityBadge criticality={asset.criticality} dotOnly className="shrink-0" />

      {/* Asset info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{asset.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">{asset.assetNumber}</span>
          {contextLine && <span className="text-xs text-muted-foreground">{contextLine}</span>}
        </div>
      </div>

      {/* Badges (primary + overflow) */}
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 gap-1 ${cfg.color}`}>
          <cfg.icon className="h-2.5 w-2.5" />
          {cfg.label}
        </Badge>
        {reasons.length > 1 && (
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            +{reasons.length - 1}
          </Badge>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  )
}

// ── Context line builder ──────────────────────────────────────────────────────

function buildContextLine(
  reason: AttentionReason,
  dueDate: string | null,
  mttrHours: number | null,
): string | null {
  switch (reason) {
    case 'OVERDUE_PM': {
      if (!dueDate) return 'แผน PM เกินกำหนด'
      const d = new Date(dueDate)
      if (!isValid(d)) return 'แผน PM เกินกำหนด'
      const days = differenceInDays(new Date(), d)
      return days === 0 ? 'PM ครบกำหนดวันนี้' : `PM เกินกำหนด ${days} วัน`
    }
    case 'WARRANTY_EXPIRING': {
      if (!dueDate) return 'การรับประกันใกล้หมดอายุ'
      const d = new Date(dueDate)
      if (!isValid(d)) return 'การรับประกันใกล้หมดอายุ'
      const days = differenceInDays(d, new Date())
      return days <= 0
        ? 'การรับประกันหมดอายุแล้ว'
        : `การรับประกันหมดใน ${days} วัน (${format(d, 'MMM d')})`
    }
    case 'HIGH_MTTR':
      return mttrHours !== null
        ? `เวลาซ่อมเฉลี่ย: ${mttrHours.toFixed(0)} ชม.`
        : 'ระยะเวลาซ่อมเฉลี่ยสูง'
    case 'OPEN_EMERGENCY_WO':
      return 'มีใบสั่งงานฉุกเฉินที่เปิดอยู่'
    default:
      return null
  }
}
