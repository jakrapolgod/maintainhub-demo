'use client'

/**
 * Edit Work Order page.
 *
 * Features:
 *   - Pre-fills form from the cached detail query
 *   - Role-aware field editing: MANAGER/ADMIN → all fields; TECHNICIAN → description only
 *   - Shows a diff card of changed fields before the user submits
 *   - Optimistic update via useUpdateWorkOrder (rolls back on error)
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter }                    from 'next/navigation'
import { useForm, Controller }          from 'react-hook-form'
import { zodResolver }                  from '@hookform/resolvers/zod'
import { z }                            from 'zod'
import { ArrowLeft, Loader2, Eye }      from 'lucide-react'
import { toast }                        from 'sonner'

import { Button }            from '@/components/ui/button'
import { Input }             from '@/components/ui/input'
import { Label }             from '@/components/ui/label'
import { Textarea }          from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge }             from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton }          from '@/components/ui/skeleton'

import { useWorkOrder, useUpdateWorkOrder } from '@/hooks/useWorkOrders'
import { useMe }                            from '@/hooks/use-auth'
import type { WOPriority, UpdateWorkOrderPayload } from '@/lib/api/work-orders'

// ── Schema ────────────────────────────────────────────────────────────────────

const managerSchema = z.object({
  title:       z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority:    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  dueDate:     z.string().optional(),
  assigneeIds: z.string().optional(),   // comma-separated CUIDs in the form
})

type EditFormValues = z.infer<typeof managerSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function EditWorkOrderClient({ id }: { id: string }) {
  const router = useRouter()
  const { data: wo,   isPending: woLoading }  = useWorkOrder(id)
  const { data: me,   isPending: meLoading }  = useMe()
  const updateMutation = useUpdateWorkOrder(id)

  const isTechnician = me?.role === 'TECHNICIAN'
  const isLoading    = woLoading || meLoading

  const form = useForm<EditFormValues>({
    resolver:      zodResolver(managerSchema),
    defaultValues: {},
  })

  // Populate form once WO is loaded
  useEffect(() => {
    if (!wo) return
    form.reset({
      title:       wo.title,
      description: wo.description ?? '',
      priority:    wo.priority,
      dueDate:     wo.dueDate ? wo.dueDate.slice(0, 16) : '',
      assigneeIds: wo.assigneeIds.join(', '),
    })
  }, [wo, form])

  // ── Diff calculation ────────────────────────────────────────────────────────
  const watched = form.watch()
  const diff = useMemo(() => {
    if (!wo) return []
    const changes: Array<{ field: string; from: string; to: string }> = []

    if (watched.title !== undefined && watched.title !== wo.title) {
      changes.push({ field: 'Title', from: wo.title, to: watched.title })
    }
    if (watched.description !== undefined && watched.description !== (wo.description ?? '')) {
      changes.push({ field: 'Description', from: wo.description ?? '(empty)', to: watched.description || '(empty)' })
    }
    if (!isTechnician && watched.priority && watched.priority !== wo.priority) {
      changes.push({ field: 'Priority', from: wo.priority, to: watched.priority })
    }

    return changes
  }, [wo, watched, isTechnician])

  function buildPayload(values: EditFormValues): UpdateWorkOrderPayload {
    const payload: UpdateWorkOrderPayload = {}

    if (!isTechnician) {
      if (values.title !== undefined && values.title !== wo?.title) {
        payload.title = values.title
      }
      if (values.priority !== undefined && values.priority !== wo?.priority) {
        payload.priority = values.priority as WOPriority
      }
      if (values.dueDate !== undefined && values.dueDate) {
        payload.dueDate = values.dueDate
      }
      if (values.assigneeIds !== undefined) {
        const ids = values.assigneeIds.split(',').map((s) => s.trim()).filter(Boolean)
        if (ids.join(',') !== wo?.assigneeIds.join(',')) {
          payload.assigneeIds = ids
        }
      }
    }
    if (values.description !== undefined && values.description !== (wo?.description ?? '')) {
      payload.description = values.description
    }

    return payload
  }

  function onSubmit(values: EditFormValues) {
    const payload = buildPayload(values)
    if (Object.keys(payload).length === 0) {
      toast.info('No changes to save.')
      return
    }

    updateMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('Work order updated')
        router.push(`/work-orders/${id}`)
      },
    })
  }

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )

  if (!wo) return (
    <div className="p-6 text-center text-muted-foreground">Work order not found.</div>
  )

  const isTerminal = wo.status === 'COMPLETED' || wo.status === 'CANCELLED'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Edit Work Order</h1>
          <p className="text-sm text-muted-foreground font-mono">{wo.woNumber} · {wo.title}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push(`/work-orders/${id}`)}>
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* Role restriction notice */}
          {isTechnician && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Technician role</strong> — you can only edit the description field.
            </div>
          )}

          {/* Terminal state notice */}
          {isTerminal && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              This work order is <strong>{wo.status}</strong> and cannot be edited.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Edit Details</CardTitle>
              <CardDescription>Changes will be logged in the audit trail.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Title — MANAGER/ADMIN only */}
                {!isTechnician && (
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" {...form.register('title')} disabled={isTerminal} />
                    {form.formState.errors.title && (
                      <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
                    )}
                  </div>
                )}

                {/* Description — all roles */}
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={4}
                    {...form.register('description')}
                    disabled={isTerminal}
                  />
                </div>

                {/* Priority — MANAGER/ADMIN only */}
                {!isTechnician && (
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Controller
                      name="priority"
                      control={form.control}
                      render={({ field }) => (
                        <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={isTerminal}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CRITICAL">Critical</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                            <SelectItem value="MEDIUM">Medium</SelectItem>
                            <SelectItem value="LOW">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                {/* Due date — MANAGER/ADMIN only */}
                {!isTechnician && (
                  <div className="space-y-1.5">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="datetime-local"
                      {...form.register('dueDate')}
                      disabled={isTerminal}
                    />
                  </div>
                )}

                {/* Assignee IDs — MANAGER/ADMIN only */}
                {!isTechnician && (
                  <div className="space-y-1.5">
                    <Label htmlFor="assigneeIds">Assignee IDs</Label>
                    <Input
                      id="assigneeIds"
                      placeholder="cuid1, cuid2, …  (comma-separated)"
                      {...form.register('assigneeIds')}
                      disabled={isTerminal}
                    />
                    <p className="text-xs text-muted-foreground">Current: {wo.assigneeIds.length > 0 ? wo.assigneeIds.join(', ') : 'Unassigned'}</p>
                  </div>
                )}

                {/* Actions */}
                {!isTerminal && (
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={updateMutation.isPending || diff.length === 0} className="gap-2">
                      {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                      Discard
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Diff preview */}
          {diff.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800">Pending Changes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {diff.map((d) => (
                  <div key={d.field} className="text-xs rounded-md bg-white border p-2.5">
                    <p className="font-semibold text-muted-foreground mb-1">{d.field}</p>
                    <div className="flex gap-2">
                      <div className="flex-1 rounded bg-red-50 px-2 py-1 text-red-700 line-clamp-1">{d.from}</div>
                      <span className="text-muted-foreground self-center">→</span>
                      <div className="flex-1 rounded bg-green-50 px-2 py-1 text-green-700 line-clamp-1">{d.to}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
