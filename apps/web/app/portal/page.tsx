'use client'

/**
 * Contractor Portal — /portal?token=<opaque-token>
 *
 * This page is publicly accessible. The contractor receives a URL from their
 * client contact (e.g. "https://app.maintainhub.com/portal?token=abc123").
 *
 * Flow:
 *   1. Extract ?token from the URL.
 *   2. Exchange the token via GET /api/v1/contractor/portal/auth.
 *   3. If valid → fetch assigned work orders.
 *   4. Display a read-only list of WOs the contractor can see.
 *
 * No CMMS account is required. The token is scoped and time-limited.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, ClipboardList, AlertCircle, HardHat, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string
  woNumber: string
  title: string
  description?: string
  type: string
  priority: string
  status: string
  dueDate?: string
  createdAt: string
  asset?: { id: string; assetNumber: string; name: string }
  site?: { id: string; name: string; code: string }
}

interface PortalData {
  contractorName: string
  workOrders: WorkOrder[]
  expiresAt: string
}

// ── Status & Priority helpers ─────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  OPEN: 'secondary',
  IN_PROGRESS: 'default',
  ON_HOLD: 'outline',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-green-500',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContractorPortalPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string>('')
  const [data, setData] = useState<PortalData | null>(null)

  useEffect(() => {
    if (!token) {
      setError('No access token provided. Please use the URL sent to you by your client contact.')
      setState('error')
      return
    }

    setState('loading')

    fetch(`${API_BASE}/api/v1/contractor/portal/work-orders?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          throw new Error(body.message ?? `Server error ${res.status}`)
        }
        return res.json() as Promise<PortalData>
      })
      .then((payload) => {
        setData(payload)
        setState('ready')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load your work orders.')
        setState('error')
      })
  }, [token])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (state === 'idle' || state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your access…</p>
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (state === 'error' || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full space-y-4">
          <div className="flex items-center gap-3">
            <HardHat className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Contractor Portal</h1>
          </div>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact the person who sent you this link.
          </p>
        </div>
      </div>
    )
  }

  // ── Work order list ────────────────────────────────────────────────────────
  const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <HardHat className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Contractor Portal</h1>
            <p className="text-xs text-muted-foreground">
              Welcome, {data.contractorName} · Access expires {expiryDate}
            </p>
          </div>
        </div>
      </header>

      {/* Work order list */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Assigned Work Orders
          </h2>
          <span className="text-sm text-muted-foreground">{data.workOrders.length} total</span>
        </div>

        {data.workOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No work orders assigned to you yet.
            </CardContent>
          </Card>
        ) : (
          data.workOrders.map((wo) => (
            <Card key={wo.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">{wo.woNumber}</p>
                    <CardTitle className="text-base mt-0.5">{wo.title}</CardTitle>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Badge variant={STATUS_VARIANT[wo.status] ?? 'outline'}>{wo.status}</Badge>
                    <span
                      className={`text-xs font-semibold ${PRIORITY_COLOR[wo.priority] ?? ''} self-center`}
                    >
                      {wo.priority}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {wo.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{wo.description}</p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {wo.asset && (
                    <span>
                      Asset: <span className="font-medium text-foreground">{wo.asset.name}</span>
                      <span className="ml-1 font-mono text-muted-foreground">
                        ({wo.asset.assetNumber})
                      </span>
                    </span>
                  )}
                  {wo.site && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span className="font-medium text-foreground">{wo.site.name}</span>
                    </span>
                  )}
                  {wo.dueDate && (
                    <span>
                      Due:{' '}
                      <span className="font-medium text-foreground">
                        {new Date(wo.dueDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </span>
                  )}
                  <span>Type: {wo.type.replace('_', ' ')}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          This portal is read-only. Contact your client contact for updates.
        </p>
      </main>
    </div>
  )
}
