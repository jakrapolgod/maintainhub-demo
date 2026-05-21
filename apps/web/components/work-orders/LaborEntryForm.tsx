/**
 * LaborEntryForm — dialog for logging time worked on a work order.
 *
 * Fields:
 *   date        — date picker (max today)
 *   hours       — number input, 0.5 step, 0.5–24 range
 *   rate        — hourly rate in THB
 *   description — optional free-text notes
 *
 * Live preview: total cost = hours × rate updates as the user types.
 * On submit: calls useAddLabor mutation and closes the dialog.
 */
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Loader2, Calculator } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useAddLabor } from '@/hooks/useWorkOrders'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  date: z
    .string()
    .min(1, 'Date is required')
    .refine((d) => d <= format(new Date(), 'yyyy-MM-dd'), {
      message: 'Date cannot be in the future',
    }),
  hours: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0.5, 'Minimum 0.5 hours')
    .max(24, 'Maximum 24 hours per entry')
    .multipleOf(0.5, 'Must be in 30-minute increments (0.5, 1.0, 1.5, …)'),
  rate: z
    .number({ invalid_type_error: 'Enter a number' })
    .positive('Rate must be positive')
    .max(999_999, 'Rate too high'),
  description: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LaborEntryFormProps {
  /** Work order ID to attach the labor entry to. */
  workOrderId: string
  open: boolean
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LaborEntryForm({ workOrderId, open, onClose }: LaborEntryFormProps) {
  const addLabor = useAddLabor(workOrderId)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      hours: 1,
      rate: 500,
    },
  })

  const hours = form.watch('hours') ?? 0
  const rate = form.watch('rate') ?? 0
  const total = Number.isFinite(hours * rate) ? hours * rate : 0

  function handleClose() {
    form.reset()
    onClose()
  }

  function onSubmit(values: FormValues) {
    addLabor.mutate(
      {
        date: values.date,
        hours: values.hours,
        rate: values.rate,
        ...(values.description !== undefined && { description: values.description }),
      },
      {
        onSuccess: () => {
          handleClose()
        },
      },
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
          <DialogTitle>Log Labor Entry</DialogTitle>
          <DialogDescription>
            Record hours worked. Entries are visible to managers in the Labor & Cost tab.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="labor-date">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="labor-date"
              type="date"
              max={format(new Date(), 'yyyy-MM-dd')}
              {...form.register('date')}
            />
            {form.formState.errors.date && (
              <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
            )}
          </div>

          {/* Hours + Rate side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="labor-hours">
                Hours <span className="text-destructive">*</span>
              </Label>
              <Input
                id="labor-hours"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                {...form.register('hours', { valueAsNumber: true })}
              />
              {form.formState.errors.hours && (
                <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labor-rate">
                Rate / hr (฿) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="labor-rate"
                type="number"
                min={0}
                step={50}
                {...form.register('rate', { valueAsNumber: true })}
              />
              {form.formState.errors.rate && (
                <p className="text-xs text-destructive">{form.formState.errors.rate.message}</p>
              )}
            </div>
          </div>

          {/* Live total preview */}
          <div
            data-testid="labor-total-preview"
            className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2"
          >
            <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Total cost:</span>
            <span className="ml-auto text-sm font-semibold">
              ฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="labor-desc">Notes</Label>
            <Textarea
              id="labor-desc"
              placeholder="Optional description of work performed…"
              rows={2}
              {...form.register('description')}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addLabor.isPending} className="gap-2">
              {addLabor.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
