'use client'

/**
 * EditPMScheduleClient — loads the existing schedule and renders the builder
 * in edit mode, wiring `onSaved` to call updatePMSchedule.
 */
import { useRouter } from 'next/navigation'
import { Loader2 }   from 'lucide-react'
import { toast }     from 'sonner'

import { Skeleton }            from '@/components/ui/skeleton'
import { PMScheduleBuilder }   from '../../new/pm-schedule-builder'
import { usePMSchedule, useUpdatePMSchedule } from '@/hooks/usePMSchedules'
import type { PMFrequency } from '@/lib/api/pm-schedules'

interface EditPMScheduleClientProps {
  id: string
}

export function EditPMScheduleClient({ id }: EditPMScheduleClientProps) {
  const router     = useRouter()
  const { data, isPending, error } = usePMSchedule(id)
  const updateMut  = useUpdatePMSchedule(id)

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Schedule not found.</p>
      </div>
    )
  }

  const calRule = data.calendarRule
  const metRule = data.meterRule

  return (
    <PMScheduleBuilder
      scheduleId={id}
      initialValues={{
        assetId:      data.assetId,
        title:        data.title,
        description:  data.description,
        type:         data.type,
        frequency:    (calRule?.frequency as PMFrequency) ?? 'monthly',
        interval:     calRule?.interval ?? metRule?.interval ?? 1,
        meterField:   metRule?.meterField ?? '',
        tolerance:    metRule?.tolerance ?? 10,
        tasks:        Array.isArray((data as unknown as { taskList?: unknown[] }).taskList)
          ? ((data as unknown as { taskList: unknown[] }).taskList as import('@/lib/api/pm-schedules').PMTask[])
          : [],
        skills:       data.requiredSkillIds,
        assignees:    data.defaultAssigneeIds,
      }}
      onSaved={() => {
        toast.success('PM schedule updated')
        router.push('/pm-schedules')
      }}
    />
  )
}
