import { Suspense } from 'react'
import type { Metadata } from 'next'
import { EditWorkOrderClient } from './edit-work-order-client'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Edit Work Order' }

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96 rounded-xl" />}>
      <EditWorkOrderClient id={id} />
    </Suspense>
  )
}
