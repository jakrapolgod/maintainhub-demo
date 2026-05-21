import type { Metadata }     from 'next'
import { Suspense }           from 'react'
import { Skeleton }           from '@/components/ui/skeleton'
import { PMScheduleBuilder }  from './pm-schedule-builder'

export const metadata: Metadata = { title: 'New PM Schedule' }

export default function NewPMSchedulePage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96 rounded-xl" />}>
      <PMScheduleBuilder />
    </Suspense>
  )
}
