'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

// ── Demo accounts ─────────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    email: 'admin@thaisteelworks.co.th',
    password: 'Demo1234!',
    color: 'bg-red-500',
    description: 'Full system access',
  },
  {
    role: 'Manager',
    email: 'manager@thaisteelworks.co.th',
    password: 'Demo1234!',
    color: 'bg-blue-500',
    description: 'Approve work orders & reports',
  },
  {
    role: 'Technician',
    email: 'tech@thaisteelworks.co.th',
    password: 'Demo1234!',
    color: 'bg-green-500',
    description: 'Execute maintenance tasks',
  },
] as const

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validate demo credentials
    const valid = DEMO_ACCOUNTS.some((a) => a.email === email.trim() && a.password === password)
    if (!valid) {
      setError('Invalid credentials. Use one of the demo accounts below.')
      return
    }

    setLoading(true)
    // Simulate auth round-trip so it feels real
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 800)
    })
    router.push('/dashboard')
  }

  return (
    <div className="flex min-h-dvh">
      {/* ── Left panel: branding ────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-zinc-900 p-12 text-white">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-yellow-400" />
          <span className="text-xl font-bold">MaintainHub</span>
        </div>

        <div>
          <blockquote className="text-2xl font-medium leading-snug text-zinc-100">
            "ลดต้นทุนการซ่อมบำรุงได้ถึง 35% ภายใน 6 เดือนแรก"
          </blockquote>
          <p className="mt-4 text-zinc-400">— ผู้จัดการฝ่ายซ่อมบำรุง · โรงงานเหล็กไทยสตีลเวิร์คส</p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
          {['Work Orders', 'Asset Registry', 'PM Schedules', 'AI Analytics', 'Inventory'].map(
            (f) => (
              <span key={f} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                {f}
              </span>
            ),
          )}
        </div>
      </div>

      {/* ── Right panel: form ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Logo (mobile only) */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Wrench className="h-5 w-5 text-yellow-500" />
            <span className="text-lg font-bold">MaintainHub</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a demo account to explore the platform
            </p>
          </div>

          {/* Demo account quick-fill ────────────────────────────────────────── */}
          <div className="mb-6 rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Quick demo access
            </p>
            <div className="flex flex-col gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-background hover:shadow-sm',
                    email === acc.email && 'bg-background shadow-sm ring-1 ring-border',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                      acc.color,
                    )}
                  >
                    {acc.role[0]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{acc.role}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{acc.description}</span>
                  </span>
                  {email === acc.email && (
                    <Badge variant="secondary" className="text-[10px]">
                      Selected
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Login form ─────────────────────────────────────────────────────── */}
          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            This is a read-only demo environment. No real data is stored.
          </p>
        </div>
      </div>
    </div>
  )
}
