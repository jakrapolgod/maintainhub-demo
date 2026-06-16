import { Suspense } from 'react'
import type { Metadata } from 'next'
import { NewWorkOrderClient } from './new-work-order-client'

export const metadata: Metadata = { title: 'สร้างใบสั่งงาน' }

export default function NewWorkOrderPage() {
  return (
    <Suspense>
      <NewWorkOrderClient />
    </Suspense>
  )
}
