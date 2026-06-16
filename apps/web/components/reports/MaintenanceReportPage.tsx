'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  generateMaintenanceReport,
  listMaintenanceReports,
  listSites,
  type MaintenanceReportType,
} from '@/lib/api/reports'
import { ApiError } from '@/lib/api'

/** First day of N months ago, formatted as YYYY-MM-DD. */
function monthsAgo(n: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1))
    .toISOString()
    .slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  reportType: MaintenanceReportType
  title: string
  description: string
  /** Whether to show the site selector. Default true. */
  showSiteSelector?: boolean
}

export function MaintenanceReportPage({
  reportType,
  title,
  description,
  showSiteSelector = true,
}: Props) {
  const [periodFrom, setPeriodFrom] = useState(monthsAgo(1))
  const [periodTo, setPeriodTo] = useState(today())
  const [siteId, setSiteId] = useState<string>('all')
  const [result, setResult] = useState<{ docNumber: string; pdfUrl: string } | null>(null)

  const queryClient = useQueryClient()

  const sites = useQuery({
    queryKey: ['sites'],
    queryFn: listSites,
    staleTime: 300_000,
    enabled: showSiteSelector,
  })

  const history = useQuery({
    queryKey: ['reports', 'maintenance', reportType],
    queryFn: () => listMaintenanceReports(reportType),
  })

  const generate = useMutation({
    mutationFn: () =>
      generateMaintenanceReport(reportType, {
        periodFrom: new Date(periodFrom).toISOString(),
        periodTo: new Date(periodTo).toISOString(),
        ...(siteId !== 'all' && { siteId }),
      }),
    onSuccess: (data) => {
      setResult(data)
      void queryClient.invalidateQueries({ queryKey: ['reports', 'maintenance', reportType] })
    },
  })

  const isForbidden = generate.error instanceof ApiError && generate.error.status === 403

  const rows = history.data?.reports ?? []

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="p-6 space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">สร้างรายงาน</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                ช่วงเวลาเริ่มต้น
              </label>
              <Input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                ช่วงเวลาสิ้นสุด
              </label>
              <Input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="w-40"
              />
            </div>
            {showSiteSelector && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">สาขา</label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="ทุกสาขา" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกสาขา</SelectItem>
                    {(sites.data ?? []).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? 'กำลังสร้าง…' : 'สร้างรายงาน'}
            </Button>
          </div>

          {isForbidden && (
            <p className="text-sm text-red-600 mt-3">
              การสร้างรายงานสำหรับผู้จัดการและผู้ดูแลระบบเท่านั้น
            </p>
          )}

          {result && (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between">
              <span>
                รายงาน <span className="font-mono">{result.docNumber}</span> สร้างสำเร็จแล้ว
              </span>
              <Button variant="outline" size="sm" asChild>
                <a href={result.pdfUrl} target="_blank" rel="noreferrer">
                  ดาวน์โหลด PDF
                </a>
              </Button>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3">ประวัติรายงาน</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {['เลขที่เอกสาร', 'ช่วงเวลา', 'สร้างโดย', 'วันที่สร้าง', 'PDF'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.isPending ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-24 w-full" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      ยังไม่มีรายงาน
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{r.docNumber}</td>
                      <td className="px-4 py-3">
                        {r.periodFrom.slice(0, 10)} ถึง {r.periodTo.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">{r.generatedBy}</td>
                      <td className="px-4 py-3">{r.createdAt.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          ดาวน์โหลด
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
