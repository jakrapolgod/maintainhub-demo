import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardClient } from './dashboard-client'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">แผงควบคุม</h1>
        <p className="text-sm text-muted-foreground">ภาพรวมกิจกรรม CMMS</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardClient />
      </Suspense>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Skeleton className="h-80 rounded-xl lg:col-span-1" />
      <Skeleton className="h-80 rounded-xl lg:col-span-2" />
    </div>
  )
}
