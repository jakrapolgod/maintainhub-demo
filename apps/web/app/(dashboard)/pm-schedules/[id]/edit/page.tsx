import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { EditPMScheduleClient } from './edit-pm-schedule-client'

export const metadata: Metadata = { title: 'Edit PM Schedule' }

export default async function EditPMSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96 rounded-xl" />}>
      <EditPMScheduleClient id={id} />
    </Suspense>
  )
}
