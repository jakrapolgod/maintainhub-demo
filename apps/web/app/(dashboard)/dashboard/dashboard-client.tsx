'use client'

import Link from 'next/link'
import { ArrowRight, Wrench, Package2, CalendarCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AssetAttentionWidget }  from '@/components/assets/AssetAttentionWidget'
import { PMComplianceWidget }    from '@/components/pm-schedules/PMComplianceWidget'

export function DashboardClient() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column: attention + compliance widgets */}
      <div className="lg:col-span-1 space-y-4">
        <AssetAttentionWidget limit={5} />
        <PMComplianceWidget />
      </div>

      {/* Right column: quick links */}
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />Work Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Manage maintenance tasks across your facility</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/work-orders">
                  Open Work Orders <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package2 className="h-4 w-4 text-muted-foreground" />Assets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">View and manage your physical asset registry</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/assets">
                  Open Assets <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />PM Schedules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Plan and track preventive maintenance</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/pm-schedules">
                  Open PM Schedules <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
