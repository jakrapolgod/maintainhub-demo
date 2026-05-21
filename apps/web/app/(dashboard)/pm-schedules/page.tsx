import type { Metadata } from 'next'
import { Suspense }      from 'react'
import { Skeleton }      from '@/components/ui/skeleton'
import { PMSchedulesClient } from './pm-schedules-client'

export const metadata: Metadata = { title: 'PM Schedules' }

export default function PMSchedulesPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Suspense fallback={<PageSkeleton />}>
        <PMSchedulesClient />
      </Suspense>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
