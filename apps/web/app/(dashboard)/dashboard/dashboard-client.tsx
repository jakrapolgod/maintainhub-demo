'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Wrench, Package2, CalendarCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetAttentionWidget } from '@/components/assets/AssetAttentionWidget'
import { PMComplianceWidget } from '@/components/pm-schedules/PMComplianceWidget'
import { SitesOverviewWidget } from '@/components/sites/SitesOverviewWidget'

export function DashboardClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300)
    return () => clearTimeout(t)
  }, [])

  if (!mounted)
    return (
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 rounded-xl lg:col-span-1" />
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    )

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column: attention + compliance + multi-site widgets */}
      <div className="lg:col-span-1 space-y-4">
        <SitesOverviewWidget />
        <AssetAttentionWidget limit={5} />
        <PMComplianceWidget />
      </div>

      {/* Right column: quick links */}
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                ใบสั่งงาน
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">จัดการงานซ่อมบำรุงทั่วทั้งโรงงาน</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/work-orders">
                  เปิดรายการใบสั่งงาน <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package2 className="h-4 w-4 text-muted-foreground" />
                สินทรัพย์
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">ดูและจัดการทะเบียนสินทรัพย์</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/assets">
                  เปิดรายการสินทรัพย์ <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                แผนบำรุงรักษา
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                วางแผนและติดตามการบำรุงรักษาเชิงป้องกัน
              </p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/pm-schedules">
                  เปิดแผนบำรุงรักษา <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
