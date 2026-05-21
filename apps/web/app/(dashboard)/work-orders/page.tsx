import { Suspense } from 'react'
import type { Metadata } from 'next'
import { WorkOrderListClient } from './work-order-list-client'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Work Orders' }

// This is a Server Component — Next.js will render the shell on the server
// and stream the client bundle for the interactive list below.
export default function WorkOrdersPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b bg-background px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
        <p className="text-sm text-muted-foreground">
          Track and manage all maintenance tasks across your facility.
        </p>
      </div>

      {/* Interactive list (client boundary) */}
      <Suspense fallback={<WorkOrderListSkeleton />}>
        <WorkOrderListClient />
      </Suspense>
    </div>
  )
}

function WorkOrderListSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4">
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}
