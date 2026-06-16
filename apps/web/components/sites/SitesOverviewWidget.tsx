'use client'

/**
 * SitesOverviewWidget
 *
 * Multi-site dashboard panel.
 *   - ADMIN  → sees every site in the tenant with asset/WO counts
 *   - MANAGER → sees only sites they are assigned to
 *   - Other roles → widget is hidden
 *
 * Data: GET /api/v1/sites
 */

import { useEffect, useState } from 'react'
import { Building2, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiFetch } from '@/lib/api'

interface SiteCount {
  assets: number
  workOrders: number
  userSites: number
}

interface Site {
  id: string
  name: string
  code: string
  address?: string
  isActive: boolean
  _count: SiteCount
}

interface SitesResponse {
  sites: Site[]
}

export function SitesOverviewWidget() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<SitesResponse>('/sites')
      .then((data) => setSites(data.sites))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'โหลดข้อมูลสาขาไม่สำเร็จ')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            ภาพรวมสาขา
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            ภาพรวมสาขา
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-destructive py-4">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    )
  }

  if (sites.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            ภาพรวมสาขา
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          ยังไม่มีสาขาในระบบ
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            ภาพรวมสาขา
          </CardTitle>
          <span className="text-xs text-muted-foreground">{sites.length} สาขา</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        {sites.map((site) => (
          <div
            key={site.id}
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{site.name}</span>
                {!site.isActive && (
                  <Badge variant="outline" className="text-xs py-0">
                    ไม่ใช้งาน
                  </Badge>
                )}
              </div>
              <p className="text-xs font-mono text-muted-foreground">{site.code}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="text-right">
                <p className="font-semibold text-foreground">{site._count.workOrders}</p>
                <p>ใบสั่งงาน</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{site._count.assets}</p>
                <p>สินทรัพย์</p>
              </div>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
