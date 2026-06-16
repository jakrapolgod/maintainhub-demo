'use client'

/**
 * New Work Order page — two mode toggle: AI Chat (default) | Manual Form.
 *
 * When redirected from the AI drawer with query params, mode defaults to "manual"
 * and the form is pre-filled with the draft values.
 */
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Sparkles, ClipboardList, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AIDraftDrawer } from '../ai-draft-drawer'

import { useCreateWorkOrder } from '@/hooks/useWorkOrders'
import type { WOType, WOPriority } from '@/lib/api/work-orders'

// ── Form schema ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(3, 'อย่างน้อย 3 ตัวอักษร').max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  assetId: z.string().min(1, 'กรุณาระบุสินทรัพย์'),
  dueDate: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function NewWorkOrderClient() {
  const router = useRouter()
  const params = useSearchParams()
  const initialMode = params.get('mode') === 'manual' ? 'manual' : 'ai'
  const [mode, setMode] = useState<'ai' | 'manual'>(initialMode)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(initialMode === 'ai')

  const createMutation = useCreateWorkOrder()

  const defaultValues: Partial<CreateFormValues> = {
    title: params.get('title') ?? '',
    description: params.get('description') ?? '',
    type: (params.get('type') ?? 'CORRECTIVE') as WOType,
    priority: (params.get('priority') ?? 'MEDIUM') as WOPriority,
    assetId: params.get('assetId') ?? '',
  }

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues,
  })

  function onSubmit(values: CreateFormValues) {
    createMutation.mutate(
      {
        title: values.title,
        type: values.type,
        priority: values.priority,
        assetId: values.assetId,
        ...(values.description && { description: values.description }),
        ...(values.dueDate && { dueDate: values.dueDate }),
      },
      {
        onSuccess: (result) => {
          toast.success(`สร้างใบสั่งงาน ${result.woNumber} สำเร็จ`)
          router.push(`/work-orders/${result.id}`)
        },
      },
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">สร้างใบสั่งงานใหม่</h1>
          <p className="text-sm text-muted-foreground">เลือกวิธีสร้างใบสั่งงาน</p>
        </div>

        {/* Mode toggle */}
        <div className="ml-auto flex items-center rounded-lg border bg-muted p-1 gap-1">
          <Button
            variant={mode === 'ai' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setMode('ai')
              setAiDrawerOpen(true)
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            แชท AI
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setMode('manual')
              setAiDrawerOpen(false)
            }}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            แบบฟอร์มทั่วไป
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {mode === 'ai' ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Sparkles className="h-12 w-12 text-primary/50" />
            <h2 className="text-lg font-semibold">ผู้ช่วย AI สร้างใบสั่งงาน</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              อธิบายปัญหาการซ่อมบำรุงด้วยภาษาธรรมชาติ และ Claude จะสร้างใบสั่งงานครบถ้วนให้คุณ
            </p>
            <Button onClick={() => setAiDrawerOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              เปิดแชท AI
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>รายละเอียดใบสั่งงาน</CardTitle>
                <CardDescription>กรอกข้อมูลที่จำเป็นเพื่อสร้างใบสั่งงานใหม่</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label htmlFor="title">
                      หัวข้องาน <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="title"
                      placeholder="เช่น เปลี่ยนซีลกลของปั๊ม P-101"
                      {...form.register('title')}
                    />
                    {form.formState.errors.title && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="description">รายละเอียด</Label>
                    <Textarea
                      id="description"
                      placeholder="อธิบายปัญหา อาการ และบริบทที่เกี่ยวข้อง…"
                      rows={4}
                      {...form.register('description')}
                    />
                  </div>

                  {/* Type + Priority */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>
                        ประเภทงาน <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.watch('type')}
                        onValueChange={(v) => form.setValue('type', v as WOType)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CORRECTIVE">งานแก้ไข</SelectItem>
                          <SelectItem value="PREVENTIVE">งานป้องกัน</SelectItem>
                          <SelectItem value="INSPECTION">งานตรวจสอบ</SelectItem>
                          <SelectItem value="EMERGENCY">งานฉุกเฉิน</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>
                        ความเร่งด่วน <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.watch('priority')}
                        onValueChange={(v) => form.setValue('priority', v as WOPriority)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRITICAL">วิกฤต</SelectItem>
                          <SelectItem value="HIGH">สูง</SelectItem>
                          <SelectItem value="MEDIUM">ปานกลาง</SelectItem>
                          <SelectItem value="LOW">ต่ำ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Asset ID */}
                  <div className="space-y-1.5">
                    <Label htmlFor="assetId">
                      รหัสสินทรัพย์ <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="assetId"
                      placeholder="CUID สินทรัพย์"
                      {...form.register('assetId')}
                    />
                    {form.formState.errors.assetId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.assetId.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      ระบุ CUID สินทรัพย์จากทะเบียนสินทรัพย์
                    </p>
                  </div>

                  {/* Due date */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dueDate">วันกำหนดเสร็จ</Label>
                    <Input id="dueDate" type="datetime-local" {...form.register('dueDate')} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      สร้างใบสั่งงาน
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                      ยกเลิก
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* AI Drawer */}
      <AIDraftDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  )
}
