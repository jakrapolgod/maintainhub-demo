import type { Metadata } from 'next'
import { Skeleton }      from '@/components/ui/skeleton'
import { Suspense }      from 'react'
import { AssetDetailClient } from './asset-detail-client'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = { title: 'Asset Detail' }

export default async function AssetDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AssetDetailClient id={id} />
    </Suspense>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid grid-cols-5 gap-4 px-6 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="flex-1 px-6">
        <Skeleton className="h-10 w-96 mb-4" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
