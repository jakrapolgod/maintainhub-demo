/**
 * CompleteWorkOrderDialog — final sign-off dialog for completing a work order.
 *
 * Sections:
 *   1. Resolution textarea (min 10 chars, required)
 *   2. Failure code selector — two-level: Category → specific Mode
 *      (fetched from /failure-codes, grouped by category)
 *   3. Labor summary — total hours + total cost read from cached detail
 *   4. Confirm button (disabled until resolution passes validation)
 */
'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Clock, Package, ChevronRight, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import {
  useCompleteWorkOrder,
  useWorkOrderLabor,
  useWorkOrderParts,
  useFailureCodes,
} from '@/hooks/useWorkOrders'
import type { FailureCodeResult } from '@/lib/api/work-orders'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  resolution: z.string().trim().min(10, 'อธิบายงานที่ทำ (อย่างน้อย 10 ตัวอักษร)').max(5_000),
  failureCodeId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CompleteWorkOrderDialogProps {
  workOrderId: string
  open: boolean
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByCategory(codes: FailureCodeResult[]): Map<string, FailureCodeResult[]> {
  return codes.reduce((map, fc) => {
    const list = map.get(fc.category) ?? []
    list.push(fc)
    map.set(fc.category, list)
    return map
  }, new Map<string, FailureCodeResult[]>())
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompleteWorkOrderDialog({
  workOrderId,
  open,
  onClose,
}: CompleteWorkOrderDialogProps) {
  const completeMutation = useCompleteWorkOrder(workOrderId)
  const [selectedCategory, setSelectedCategory] = useState('')

  // Sub-data queries — only run when the dialog is open
  const { data: laborData, isPending: laborPending } = useWorkOrderLabor(open ? workOrderId : null)
  const { data: partsData, isPending: partsPending } = useWorkOrderParts(open ? workOrderId : null)
  const { data: failureCodes, isPending: fcPending } = useFailureCodes()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resolution: '', failureCodeId: undefined },
  })

  // Derived labor/parts totals
  const totalLaborHours = useMemo(
    () => (laborData ?? []).reduce((s, e) => s + e.hours, 0),
    [laborData],
  )
  const totalLaborCost = useMemo(
    () => (laborData ?? []).reduce((s, e) => s + e.totalCost, 0),
    [laborData],
  )
  const totalPartsCost = useMemo(
    () => (partsData ?? []).reduce((s, u) => s + u.totalCost, 0),
    [partsData],
  )

  // Failure code tree
  const categoryMap = useMemo(() => groupByCategory(failureCodes ?? []), [failureCodes])
  const categories = useMemo(() => Array.from(categoryMap.keys()).sort(), [categoryMap])
  const modesInCategory = useMemo(
    () => (selectedCategory ? (categoryMap.get(selectedCategory) ?? []) : []),
    [selectedCategory, categoryMap],
  )

  function handleClose() {
    form.reset()
    setSelectedCategory('')
    onClose()
  }

  function onSubmit(values: FormValues) {
    completeMutation.mutate(
      {
        resolution: values.resolution,
        ...(values.failureCodeId !== undefined && { failureCodeId: values.failureCodeId }),
      },
      { onSuccess: handleClose },
    )
  }

  const resolutionValue = form.watch('resolution') ?? ''
  const charCount = resolutionValue.length
  const isResolutionOk = charCount >= 10

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            ยืนยันการเสร็จสิ้นงาน
          </DialogTitle>
          <DialogDescription>
            กรอกสรุปผลการดำเนินการ ข้อมูลนี้จะถูกบันทึกเป็นหลักฐานถาวร
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Resolution */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wo-resolution">
                ผลการดำเนินการ <span className="text-destructive">*</span>
              </Label>
              <span
                className={`text-xs ${isResolutionOk ? 'text-muted-foreground' : 'text-amber-600'}`}
              >
                {charCount}/10 min
              </span>
            </div>
            <Textarea
              id="wo-resolution"
              placeholder="อธิบายงานที่ทำ อะไหล่ที่เปลี่ยน การทดสอบ และผลลัพธ์…"
              rows={5}
              {...form.register('resolution')}
              className={
                !isResolutionOk && charCount > 0
                  ? 'border-amber-300 focus-visible:ring-amber-400'
                  : ''
              }
            />
            {form.formState.errors.resolution && (
              <p className="text-xs text-destructive">{form.formState.errors.resolution.message}</p>
            )}
          </div>

          {/* Failure code — two-level select */}
          <div className="space-y-2">
            <Label>
              รหัสความเสียหาย <span className="text-xs text-muted-foreground">(ไม่บังคับ)</span>
            </Label>

            {fcPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="flex items-center gap-2">
                {/* Category selector */}
                <Select
                  value={selectedCategory || '__none__'}
                  onValueChange={(v) => {
                    const next = v === '__none__' ? '' : v
                    setSelectedCategory(next)
                    form.setValue('failureCodeId', undefined)
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="หมวดหมู่…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCategory && (
                  <>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* Mode selector */}
                    <Select
                      value={form.watch('failureCodeId') ?? '__none__'}
                      onValueChange={(v) =>
                        form.setValue('failureCodeId', v === '__none__' ? undefined : v)
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="รูปแบบความเสียหาย…" />
                      </SelectTrigger>
                      <SelectContent>
                        {modesInCategory.map((fc) => (
                          <SelectItem key={fc.id} value={fc.id}>
                            <span className="font-mono text-xs text-muted-foreground mr-1">
                              {fc.code}
                            </span>
                            {fc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Labor summary */}
          <div className="rounded-lg border bg-muted/40 divide-y text-sm">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                แรงงาน
              </span>
              {laborPending ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="font-medium">
                  {totalLaborHours.toFixed(1)} h · ฿{totalLaborCost.toLocaleString()}
                </span>
              )}
            </div>
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                อะไหล่
              </span>
              {partsPending ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="font-medium">฿{totalPartsCost.toLocaleString()}</span>
              )}
            </div>
            <div className="px-4 py-2 flex items-center justify-between font-semibold">
              <span>รวม</span>
              {laborPending || partsPending ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <span>฿{(totalLaborCost + totalPartsCost).toLocaleString()}</span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              disabled={completeMutation.isPending || !isResolutionOk}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {completeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              ยืนยันเสร็จสิ้น
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
