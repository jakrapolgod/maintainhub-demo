'use client'

/**
 * Work Order Detail page client.
 *
 * Layout:
 *   - Header: WO number, title, status badge, action buttons
 *   - Tabs: Details | Labor & Cost | Parts | Attachments | Comments | History
 *   - Each tab content is lazy-loaded and cached independently
 *   - Real-time comments via Socket.io (useWorkOrderRealtime)
 */
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { formatThaiDate, formatThaiDateTime } from '@/lib/formatThaiDate'
import {
  ArrowLeft,
  Pencil,
  Play,
  CheckCircle,
  PauseCircle,
  XCircle,
  AlertTriangle,
  Paperclip,
  Clock,
  Package,
  MessageSquare,
  History,
  Info,
  Loader2,
  Send,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge, PriorityBadge, TypeLabel } from '@/components/work-orders/wo-badges'
import { AssigneeAvatars } from '@/components/work-orders/assignee-avatars'

import {
  useWorkOrder,
  useWorkOrderLabor,
  useWorkOrderParts,
  useWorkOrderComments,
  useWorkOrderAttachments,
  useStartWorkOrder,
  useCompleteWorkOrder,
  useHoldWorkOrder,
  useCancelWorkOrder,
  useAddComment,
  useUploadAttachment,
} from '@/hooks/useWorkOrders'
import { useWorkOrderRealtime } from '@/hooks/useWorkOrderRealtime'

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkOrderDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const { data: wo, isPending, error } = useWorkOrder(id)

  // Real-time Socket.io subscription
  useWorkOrderRealtime(id, { enabled: !!wo })

  // Lifecycle mutations
  const startMutation = useStartWorkOrder(id)
  const completeMutation = useCompleteWorkOrder(id)
  const holdMutation = useHoldWorkOrder(id)
  const cancelMutation = useCancelWorkOrder(id)

  // Modal state
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  if (isPending) return <DetailSkeleton />
  if (error || !wo)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">ไม่พบใบสั่งงาน</p>
        <Button variant="outline" onClick={() => router.back()}>
          กลับ
        </Button>
      </div>
    )

  const canStart = wo.status === 'OPEN'
  const canComplete = wo.status === 'IN_PROGRESS'
  const canHold = wo.status === 'IN_PROGRESS'
  const canCancel = wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-muted-foreground">{wo.woNumber}</span>
              <TypeLabel type={wo.type} />
            </div>
            <h1 className="text-xl font-bold line-clamp-2">{wo.title}</h1>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <StatusBadge status={wo.status} />
              <PriorityBadge priority={wo.priority} />
              <span className="text-xs text-muted-foreground">{wo.assetName}</span>
              {wo.assetLocation && (
                <span className="text-xs text-muted-foreground">· {wo.assetLocation}</span>
              )}
              {wo.dueDate && (
                <span className="text-xs text-muted-foreground">
                  ครบกำหนด {formatThaiDate(wo.dueDate)}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {canStart && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                เริ่มงาน
              </Button>
            )}
            {canComplete && (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => setCompleteDialogOpen(true)}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                เสร็จสิ้น
              </Button>
            )}
            {canHold && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setHoldDialogOpen(true)}
              >
                <PauseCircle className="h-3.5 w-3.5" />
                ระงับงาน
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:bg-destructive/10"
                onClick={() => setCancelDialogOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5" />
                ยกเลิกงาน
              </Button>
            )}
            <Link href={`/work-orders/${id}/edit`}>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                แก้ไข
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="details" className="h-full flex flex-col">
          <div className="border-b px-6">
            <TabsList className="h-auto rounded-none bg-transparent p-0 gap-0">
              {[
                ['details', 'รายละเอียด', Info],
                ['labor', 'แรงงานและต้นทุน', Clock],
                ['parts', 'อะไหล่ที่ใช้', Package],
                ['attachments', 'เอกสารแนบ', Paperclip],
                ['comments', 'ความคิดเห็น', MessageSquare],
                ['history', 'ประวัติ', History],
              ].map(([value, label, Icon]) => (
                <TabsTrigger
                  key={value as string}
                  value={value as string}
                  className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
                >
                  {/* @ts-expect-error -- Icon is a valid Lucide component */}
                  <Icon className="h-3.5 w-3.5" />
                  {label as string}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="details" className="m-0 p-6">
              <DetailsTab wo={wo} />
            </TabsContent>
            <TabsContent value="labor" className="m-0 p-6">
              <LaborTab woId={id} />
            </TabsContent>
            <TabsContent value="parts" className="m-0 p-6">
              <PartsTab woId={id} />
            </TabsContent>
            <TabsContent value="attachments" className="m-0 p-6">
              <AttachmentsTab woId={id} />
            </TabsContent>
            <TabsContent value="comments" className="m-0 p-6 h-full flex flex-col">
              <CommentsTab woId={id} />
            </TabsContent>
            <TabsContent value="history" className="m-0 p-6">
              <HistoryTab wo={wo} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── Inline action modals ─────────────────────────────────────────── */}
      <CompleteModal
        open={completeDialogOpen}
        onClose={() => setCompleteDialogOpen(false)}
        onConfirm={(resolution) => {
          completeMutation.mutate(
            { resolution },
            {
              onSuccess: () => setCompleteDialogOpen(false),
            },
          )
        }}
        isPending={completeMutation.isPending}
      />
      <SimpleReasonModal
        open={holdDialogOpen}
        title="ระงับงาน"
        description="อธิบายเหตุผลที่ระงับงาน"
        buttonLabel="ยืนยันระงับงาน"
        onClose={() => setHoldDialogOpen(false)}
        onConfirm={(reason) => {
          holdMutation.mutate(reason, {
            onSuccess: () => setHoldDialogOpen(false),
          })
        }}
        isPending={holdMutation.isPending}
      />
      <SimpleReasonModal
        open={cancelDialogOpen}
        title="ยกเลิกใบสั่งงาน"
        description="ระบุเหตุผลในการยกเลิก"
        buttonLabel="ยืนยันยกเลิก"
        buttonVariant="destructive"
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={(reason) => {
          cancelMutation.mutate(reason, {
            onSuccess: () => {
              setCancelDialogOpen(false)
              router.push('/work-orders')
            },
          })
        }}
        isPending={cancelMutation.isPending}
      />
    </div>
  )
}

// ── Details tab ───────────────────────────────────────────────────────────────

function DetailsTab({ wo }: { wo: import('@/lib/api/work-orders').WorkOrderDetail }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ข้อมูลพื้นฐาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="เลขที่ใบสั่งงาน" value={<span className="font-mono">{wo.woNumber}</span>} />
          <Row label="ประเภทงาน" value={wo.type} />
          <Row label="ความเร่งด่วน" value={<PriorityBadge priority={wo.priority} />} />
          <Row label="สถานะ" value={<StatusBadge status={wo.status} />} />
          <Row label="สินทรัพย์" value={wo.assetName} />
          {wo.assetLocation && <Row label="ตำแหน่ง" value={wo.assetLocation} />}
          {wo.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">รายละเอียด</p>
              <p className="text-sm">{wo.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ไทม์ไลน์และบุคลากร</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="สร้างโดย" value={wo.createdByName} />
          <Row label="สร้างเมื่อ" value={formatThaiDateTime(wo.createdAt)} />
          {wo.startedAt && <Row label="เริ่มเมื่อ" value={formatThaiDateTime(wo.startedAt)} />}
          {wo.completedAt && <Row label="เสร็จเมื่อ" value={formatThaiDateTime(wo.completedAt)} />}
          {wo.dueDate && <Row label="วันกำหนดเสร็จ" value={formatThaiDateTime(wo.dueDate)} />}
          {wo.slaDeadline && <Row label="กำหนด SLA" value={formatThaiDateTime(wo.slaDeadline)} />}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">ผู้รับผิดชอบ</p>
            {wo.assignees.length > 0 ? (
              <AssigneeAvatars assignees={wo.assignees} max={6} size="md" />
            ) : (
              <span className="text-muted-foreground text-xs">ยังไม่มอบหมาย</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">สรุปต้นทุน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row
            label="ต้นทุนแรงงาน"
            value={wo.totalLaborCost != null ? `฿${wo.totalLaborCost.toLocaleString()}` : '—'}
          />
          <Row
            label="ต้นทุนอะไหล่"
            value={wo.totalPartsCost != null ? `฿${wo.totalPartsCost.toLocaleString()}` : '—'}
          />
          <Row
            label="ต้นทุนรวม"
            value={
              wo.totalLaborCost != null && wo.totalPartsCost != null ? (
                <strong>฿{(wo.totalLaborCost + wo.totalPartsCost).toLocaleString()}</strong>
              ) : (
                '—'
              )
            }
          />
        </CardContent>
      </Card>

      {wo.resolution && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ผลการดำเนินการ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{wo.resolution}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

// ── Labor tab ─────────────────────────────────────────────────────────────────

function LaborTab({ woId }: { woId: string }) {
  const { data, isPending } = useWorkOrderLabor(woId)
  if (isPending) return <Skeleton className="h-48 w-full rounded-xl" />

  const entries = data ?? []
  const totalHours = entries.reduce((s, e) => s + e.hours, 0)
  const totalCost = entries.reduce((s, e) => s + e.totalCost, 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <StatCard label="ชั่วโมงรวม" value={`${totalHours.toFixed(1)}h`} />
        <StatCard label="ต้นทุนรวม" value={`฿${totalCost.toLocaleString()}`} />
        <StatCard label="รายการ" value={String(entries.length)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {['ช่างเทคนิค', 'วันที่', 'ชั่วโมง', 'อัตรา/ชม.', 'รวม', 'หมายเหตุ'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{e.technicianName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-3">{e.hours}h</td>
                  <td className="px-4 py-3">฿{e.ratePerHour}</td>
                  <td className="px-4 py-3 font-medium">฿{e.totalCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {e.description ?? '—'}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    ยังไม่มีรายการแรงงาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Parts tab ─────────────────────────────────────────────────────────────────

function PartsTab({ woId }: { woId: string }) {
  const { data, isPending } = useWorkOrderParts(woId)
  if (isPending) return <Skeleton className="h-48 w-full rounded-xl" />

  const usages = data ?? []
  const totalCost = usages.reduce((s, u) => s + u.totalCost, 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <StatCard label="อะไหล่ที่ใช้" value={String(usages.length)} />
        <StatCard label="ต้นทุนรวม" value={`฿${totalCost.toLocaleString()}`} />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {['รหัสอะไหล่', 'ชื่อ', 'จำนวน', 'ราคาต่อหน่วย', 'รวม', 'ใช้เมื่อ'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usages.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{u.partNumber}</td>
                  <td className="px-4 py-3">{u.partName}</td>
                  <td className="px-4 py-3">{u.quantity}</td>
                  <td className="px-4 py-3">฿{u.unitCost}</td>
                  <td className="px-4 py-3 font-medium">฿{u.totalCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatThaiDate(u.usedAt)}
                  </td>
                </tr>
              ))}
              {usages.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    ยังไม่มีการใช้อะไหล่
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Attachments tab ───────────────────────────────────────────────────────────

function AttachmentsTab({ woId }: { woId: string }) {
  const { data, isPending } = useWorkOrderAttachments(woId)
  const uploadMutation = useUploadAttachment(woId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (isPending) return <Skeleton className="h-48 w-full rounded-xl" />
  const files = data ?? []

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          อัปโหลดไฟล์
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
          onChange={handleFileChange}
        />
      </div>

      {files.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-12 text-center">
          <Paperclip className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">ยังไม่มีเอกสารแนบ</p>
          <p className="text-xs text-muted-foreground mt-1">
            อัปโหลดรูปภาพ PDF หรือ Word (สูงสุด 20 MB)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Paperclip className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium line-clamp-2 group-hover:text-primary">
                {f.fileName}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {(f.fileSize / 1024).toFixed(0)} KB · {f.uploadedByName}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Comments tab ──────────────────────────────────────────────────────────────

function CommentsTab({ woId }: { woId: string }) {
  const { data } = useWorkOrderComments(woId)
  const addCommentMutation = useAddComment(woId)
  const [body, setBody] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const comments = data ?? []

  function submitComment() {
    const text = body.trim()
    if (!text) return
    addCommentMutation.mutate(
      { content: text },
      {
        onSuccess: () => {
          setBody('')
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        },
      },
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              {c.authorAvatarUrl && <AvatarImage src={c.authorAvatarUrl} />}
              <AvatarFallback className="text-xs">{c.authorName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{c.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatThaiDateTime(c.createdAt)}
                </span>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                {c.body}
              </div>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            ยังไม่มีความคิดเห็น เริ่มการสนทนาได้เลย
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Comment input */}
      <div className="border-t pt-4 flex gap-2">
        <Textarea
          placeholder="เพิ่มความคิดเห็น… (@กล่าวถึงผู้ใช้ด้วย @userId)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment()
          }}
          rows={3}
          className="flex-1 resize-none text-sm"
        />
        <Button
          size="icon"
          onClick={submitComment}
          disabled={!body.trim() || addCommentMutation.isPending}
          className="self-end"
        >
          {addCommentMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Ctrl+Enter เพื่อส่ง · แบบเรียลไทม์ผ่าน Socket.io
      </p>
    </div>
  )
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ wo }: { wo: import('@/lib/api/work-orders').WorkOrderDetail }) {
  const entries = wo.auditTrail ?? []

  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div key={e.id} className="flex gap-3 py-2 border-b last:border-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {e.userName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium">{e.userName ?? 'ระบบ'}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {e.action}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatThaiDateTime(e.createdAt)}
              </span>
            </div>
            {e.after !== null &&
              e.after !== undefined &&
              typeof e.after === 'object' &&
              Object.keys(e.after as object).length > 0 && (
                <pre className="text-xs text-muted-foreground overflow-x-auto rounded bg-muted/50 px-2 py-1 mt-1 max-h-24">
                  {JSON.stringify(e.after, null, 2)}
                </pre>
              )}
          </div>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          ยังไม่มีประวัติการดำเนินการ
        </p>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}

function CompleteModal({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (resolution: string) => void
  isPending: boolean
}) {
  const [resolution, setResolution] = useState('')
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>ยืนยันการเสร็จสิ้นงาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              ผลการดำเนินการ <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="อธิบายสิ่งที่ดำเนินการและผลลัพธ์ (อย่างน้อย 10 ตัวอักษร)…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              disabled={resolution.trim().length < 10 || isPending}
              onClick={() => onConfirm(resolution.trim())}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ยืนยันเสร็จสิ้น
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SimpleReasonModal({
  open,
  title,
  description,
  buttonLabel,
  buttonVariant = 'default',
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean
  title: string
  description: string
  buttonLabel: string
  buttonVariant?: 'default' | 'destructive'
  onClose: () => void
  onConfirm: (reason: string) => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('')
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <Input placeholder="เหตุผล…" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              variant={buttonVariant}
              disabled={!reason.trim() || isPending}
              onClick={() => onConfirm(reason.trim())}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {buttonLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
