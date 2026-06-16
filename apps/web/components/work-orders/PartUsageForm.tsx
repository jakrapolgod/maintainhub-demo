/**
 * PartUsageForm — dialog for recording a spare-part consumption.
 *
 * UX flow:
 *   1. User types in the search box (≥2 chars triggers usePartsSearch)
 *   2. Dropdown shows matching parts with stock level
 *   3. Selecting a part auto-fills partNumber, unit cost, and stock hint
 *   4. If requested quantity > available stock, a warning is shown (but not
 *      blocked — the server enforces the rule and returns INSUFFICIENT_STOCK)
 *   5. On submit: calls useUsePart mutation and closes
 */
'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, AlertTriangle, Loader2, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useUsePart, usePartsSearch } from '@/hooks/useWorkOrders'
import type { PartSearchResult } from '@/lib/api/work-orders'

// ── Debounce helper (inline, no extra dep) ────────────────────────────────────

function useDebounceSimple<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prev = useRef(value)

  if (prev.current !== value) {
    prev.current = value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
  }

  return debounced
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  partId: z.string().min(1, 'กรุณาเลือกอะไหล่'),
  quantity: z
    .number({ invalid_type_error: 'กรุณาระบุจำนวนเต็ม' })
    .int('ต้องเป็นจำนวนเต็ม')
    .min(1, 'ขั้นต่ำ 1')
    .max(10_000, 'จำนวนสูงเกินไป'),
  unitCost: z
    .number({ invalid_type_error: 'กรุณาระบุตัวเลข' })
    .nonnegative()
    .max(9_999_999)
    .optional(),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PartUsageFormProps {
  workOrderId: string
  open: boolean
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartUsageForm({ workOrderId, open, onClose }: PartUsageFormProps) {
  const usePartMutation = useUsePart(workOrderId)
  const [search, setSearch] = useState('')
  const [selectedPart, setSelectedPart] = useState<PartSearchResult | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const debouncedSearch = useDebounceSimple(search, 300)
  const { data: partsData, isFetching } = usePartsSearch(debouncedSearch)
  const partResults = partsData?.items ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 1 },
  })

  const quantity = form.watch('quantity') ?? 0
  const overrideRate = form.watch('unitCost')
  const effectiveRate = overrideRate ?? selectedPart?.unitCost ?? 0
  const estimatedCost = quantity * effectiveRate
  const available = selectedPart ? selectedPart.quantity - selectedPart.reservedQty : 0
  const isInsufficient = selectedPart !== null && quantity > available

  function selectPart(part: PartSearchResult) {
    setSelectedPart(part)
    setSearch(`${part.partNumber} — ${part.name}`)
    setDropdownOpen(false)
    form.setValue('partId', part.id)
    form.setValue('unitCost', undefined) // reset override → use catalog price
  }

  function handleClose() {
    form.reset()
    setSearch('')
    setSelectedPart(null)
    onClose()
  }

  function onSubmit(values: FormValues) {
    usePartMutation.mutate(
      {
        partId: values.partId,
        quantity: values.quantity,
        ...(values.unitCost !== undefined && { unitCost: values.unitCost }),
      },
      { onSuccess: handleClose },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>บันทึกการใช้อะไหล่</DialogTitle>
          <DialogDescription>ค้นหาอะไหล่และระบุจำนวนที่ใช้</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Part search */}
          <div className="space-y-1.5 relative">
            <Label htmlFor="part-search">
              อะไหล่ <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="part-search"
                placeholder="ค้นหาด้วยชื่อหรือรหัสอะไหล่…"
                value={search}
                autoComplete="off"
                className="pl-9"
                onChange={(e) => {
                  setSearch(e.target.value)
                  setDropdownOpen(true)
                  if (!e.target.value) {
                    setSelectedPart(null)
                    form.setValue('partId', '')
                  }
                }}
                onFocus={() => setDropdownOpen(true)}
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown */}
            {dropdownOpen && partResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                {partResults.map((part) => {
                  const avail = part.quantity - part.reservedQty
                  return (
                    <button
                      key={part.id}
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                      onClick={() => selectPart(part)}
                    >
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{part.name}</span>
                          <span
                            className={`text-xs font-medium ${avail <= 0 ? 'text-destructive' : avail <= 5 ? 'text-amber-600' : 'text-muted-foreground'}`}
                          >
                            {avail} คงเหลือ
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {part.partNumber} · ฿{part.unitCost.toLocaleString()}
                          {part.storeLocation && ` · ${part.storeLocation}`}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {form.formState.errors.partId && (
              <p className="text-xs text-destructive">{form.formState.errors.partId.message}</p>
            )}
          </div>

          {/* Stock level hint */}
          {selectedPart && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                available <= 0
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : available <= 5
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span>
                ในคลัง: <strong>{selectedPart.quantity}</strong>
                {selectedPart.reservedQty > 0 && ` (จอง ${selectedPart.reservedQty})`}
                {' · '}คงเหลือ: <strong>{available}</strong>
              </span>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label htmlFor="part-qty">
              จำนวน <span className="text-destructive">*</span>
            </Label>
            <Input
              id="part-qty"
              type="number"
              min={1}
              max={10_000}
              step={1}
              {...form.register('quantity', { valueAsNumber: true })}
            />
            {form.formState.errors.quantity && (
              <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
            )}
          </div>

          {/* Unit cost override */}
          <div className="space-y-1.5">
            <Label htmlFor="part-cost">
              ราคาต่อหน่วยที่กำหนดเอง (฿)
              <span className="ml-1 text-xs text-muted-foreground">
                — เว้นว่างเพื่อใช้ราคาในทะเบียน {selectedPart ? `(฿${selectedPart.unitCost})` : ''}
              </span>
            </Label>
            <Input
              id="part-cost"
              type="number"
              min={0}
              step={0.01}
              placeholder={selectedPart ? String(selectedPart.unitCost) : '0.00'}
              {...form.register('unitCost', { valueAsNumber: true })}
            />
          </div>

          {/* Estimated cost */}
          {selectedPart && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">ต้นทุนโดยประมาณ:</span>
              <span className="text-sm font-semibold">
                ฿{estimatedCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Insufficient stock warning */}
          {isInsufficient && (
            <div
              data-testid="insufficient-stock-warning"
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              จำนวนที่ขอ ({quantity}) เกินกว่าสต็อกคงเหลือ ({available}) ระบบจะปฏิเสธรายการนี้
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={usePartMutation.isPending} className="gap-2">
              {usePartMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึกการใช้
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
