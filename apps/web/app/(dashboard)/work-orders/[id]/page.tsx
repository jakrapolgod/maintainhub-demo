import { Suspense } from 'react'
import type { Metadata } from 'next'
import { WorkOrderDetailClient } from './work-order-detail-client'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'รายละเอียดใบสั่งงาน' }

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <WorkOrderDetailClient id={id} />
    </Suspense>
  )
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
