import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Skeleton }   from '@/components/ui/skeleton'
import { AssetListClient } from './asset-list-client'

export const metadata: Metadata = { title: 'Assets' }

export default function AssetsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
        <p className="text-sm text-muted-foreground">
          Track and manage your physical and virtual facility assets.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <AssetListClient />
      </Suspense>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-64 border-r p-2 space-y-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" style={{ marginLeft: `${(i % 3) * 12}px` }} />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
