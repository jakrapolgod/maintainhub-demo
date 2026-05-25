'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ClipboardList,
  Package,
  CalendarClock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// ── Constants ──────────────────────────────────────────────────────────────────

export const TOUR_KEY = 'maintainhub_tour_seen'

// ── Step definitions ───────────────────────────────────────────────────────────

type Side = 'right' | 'left' | 'bottom' | 'bottom-left' | 'center'

interface TourStep {
  selector: string
  href?: string
  title: string
  description: string
  side: Side
}

const steps: TourStep[] = [
  {
    selector: '[data-tour="sidebar"]',
    title: 'Module Navigation',
    description:
      'Navigate between modules from here — Dashboard, Work Orders, Assets, PM Schedules, Inventory, and more.',
    side: 'right',
  },
  {
    selector: '[data-tour="kpi-cards"]',
    href: '/dashboard',
    title: 'Live Facility Metrics',
    description:
      'Live metrics from your facility — open work orders, SLA breaches, PM compliance rate, and mean time to repair at a glance.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="bell"]',
    title: 'Smart Notifications',
    description:
      'Get alerted on SLA breaches, preventive maintenance due dates, and low inventory stock — before they become problems.',
    side: 'bottom-left',
  },
  {
    selector: '[data-tour="search"]',
    title: 'Global Search  ⌘K',
    description:
      'Press Cmd+K (or Ctrl+K) to instantly search across all assets, work orders, and schedules from anywhere in the app.',
    side: 'bottom-left',
  },
  {
    selector: '[data-tour="ai-panel"]',
    href: '/work-orders',
    title: 'AI Work Order Creation',
    description:
      'Create work orders with AI — just describe the issue in plain language and the AI fills in priority, category, and asset details automatically.',
    side: 'left',
  },
  {
    selector: '[data-tour="asset-tree"]',
    href: '/assets',
    title: '5-Level Asset Hierarchy',
    description:
      'Browse your asset hierarchy — from Sites down to Components — with criticality ratings (A/B/C) to prioritize maintenance effort.',
    side: 'right',
  },
  {
    selector: '[data-tour="pm-calendar"]',
    href: '/pm-schedules',
    title: 'Automated PM Scheduling',
    description:
      'Preventive maintenance schedules run automatically. View upcoming PMs by calendar or list, and generate AI-powered schedule recommendations.',
    side: 'bottom',
  },
]

// ── Positioning helpers ────────────────────────────────────────────────────────

const TOOLTIP_W = 320
const TOOLTIP_H = 210
const GAP = 14

function getTooltipStyle(rect: DOMRect | null, side: Side): React.CSSProperties {
  if (!rect || side === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  const clampLeft = (l: number) => Math.max(8, Math.min(l, vw - TOOLTIP_W - 8))
  const clampTop = (t: number) => Math.max(8, Math.min(t, vh - TOOLTIP_H - 8))

  switch (side) {
    case 'right':
      return {
        position: 'fixed',
        left: Math.min(rect.right + GAP, vw - TOOLTIP_W - 8),
        top: clampTop(rect.top),
      }
    case 'left':
      return {
        position: 'fixed',
        left: Math.max(8, rect.left - GAP - TOOLTIP_W),
        top: clampTop(rect.top),
      }
    case 'bottom':
      return {
        position: 'fixed',
        top: Math.min(rect.bottom + GAP, vh - TOOLTIP_H - 8),
        left: clampLeft(rect.left),
      }
    case 'bottom-left':
      return {
        position: 'fixed',
        top: Math.min(rect.bottom + GAP, vh - TOOLTIP_H - 8),
        left: clampLeft(rect.right - TOOLTIP_W),
      }
    default:
      return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
}

function getSpotlightStyle(rect: DOMRect | null): React.CSSProperties {
  if (!rect) return { display: 'none' }
  const PAD = 6
  return {
    position: 'fixed',
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 10,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)',
    outline: '2px solid rgba(255,255,255,0.35)',
    outlineOffset: 1,
    zIndex: 9998,
    pointerEvents: 'none',
    transition: 'top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease',
  }
}

function pillClass(i: number, current: number) {
  if (i === current) return 'w-4 bg-primary'
  if (i < current) return 'w-1.5 bg-primary/40'
  return 'w-1.5 bg-muted-foreground/25'
}

// ── DemoTour component ─────────────────────────────────────────────────────────

export function DemoTour() {
  const router = useRouter()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Track whether we're waiting for a navigation to settle
  const [navigating, setNavigating] = useState(false)

  // ── Auto-show on first visit ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(TOUR_KEY)) {
      setOpen(true)
    }
  }, [])

  // ── Measure target element ─────────────────────────────────────────────────
  const measureTarget = useCallback((stepIndex: number) => {
    const timer = setTimeout(() => {
      const el = document.querySelector(steps[stepIndex].selector)
      setRect(el ? el.getBoundingClientRect() : null)
      setNavigating(false)
    }, 180) // small settle delay for React renders
    return timer
  }, [])

  // When pathname changes (navigation complete) re-measure
  useEffect(() => {
    if (!open || done) return undefined
    const timer = measureTarget(step)
    return () => clearTimeout(timer)
  }, [open, step, pathname, done, measureTarget])

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function gotoStep(next: number) {
    if (next < 0 || next >= steps.length) return
    const target = steps[next]
    setStep(next)
    if (target.href && pathname !== target.href) {
      setRect(null)
      setNavigating(true)
      router.push(target.href)
      // measureTarget will be called when pathname changes
    }
  }

  function finish() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_KEY, '1')
    }
    setDone(true)
  }

  function closeTour() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_KEY, '1')
    }
    setOpen(false)
    setDone(false)
    setStep(0)
  }

  if (!open) return null

  const current = steps[step]
  const isLast = step === steps.length - 1

  // ── Done card ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/60 z-[9997]" onClick={closeTour} />

        {/* Done card */}
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
          }}
          className="w-80 rounded-2xl border border-border bg-card shadow-2xl p-6 flex flex-col gap-4"
        >
          <div className="text-center">
            <div className="text-4xl mb-2">🎉</div>
            <h3 className="text-lg font-bold">You&apos;re ready!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Explore any module below to get started.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              { href: '/work-orders', icon: ClipboardList, label: 'Work Orders' },
              { href: '/assets', icon: Package, label: 'Assets' },
              { href: '/pm-schedules', icon: CalendarClock, label: 'PM Schedules' },
            ].map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                onClick={closeTour}
                className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </Link>
            ))}
          </div>

          <Button className="w-full" onClick={closeTour}>
            Start exploring
          </Button>
        </div>
      </>
    )
  }

  // ── Main tour UI ───────────────────────────────────────────────────────────
  const tooltipStyle = getTooltipStyle(rect, current.side)
  const spotlightStyle = getSpotlightStyle(rect)

  return (
    <>
      {/* Click blocker */}
      <div className="fixed inset-0 z-[9997]" />

      {/* Spotlight cutout */}
      {rect && <div style={spotlightStyle} aria-hidden />}

      {/* Fallback overlay when no rect (navigating) */}
      {!rect && <div className="fixed inset-0 bg-black/58 z-[9997]" />}

      {/* Tooltip card */}
      <div
        style={{ ...tooltipStyle, zIndex: 9999, width: TOOLTIP_W }}
        className="rounded-2xl border border-border bg-card shadow-2xl flex flex-col gap-3 p-5"
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${steps.length}: ${current.title}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {step + 1} / {steps.length}
            </span>
            <div className="flex gap-0.5">
              {steps.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all ${pillClass(i, step)}`} />
              ))}
            </div>
          </div>
          <button
            onClick={closeTour}
            className="rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Skip tour"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-snug">{current.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {navigating ? 'Navigating to the right page…' : current.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={closeTour} className="text-muted-foreground">
            Skip
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => gotoStep(step - 1)}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <Button
              size="sm"
              onClick={() => (isLast ? finish() : gotoStep(step + 1))}
              disabled={navigating}
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
