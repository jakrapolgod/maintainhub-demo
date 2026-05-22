import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

const scores = [
  { label: "WO",          value: 80, max: 99 },
  { label: "Assets",      value: 75, max: 99 },
  { label: "PM",          value: 72, max: 99 },
  { label: "AI",          value: 93, max: 99 },
  { label: "UX",          value: 95, max: 99 },
  { label: "Integration", value: 55, max: 99 },
]

const features = [
  "Work Orders",
  "Asset Management",
  "Preventive Maintenance",
  "AI Assistant",
  "Analytics",
  "Integration",
]

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-16 text-center">
      {/* Hero */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🔧</span>
          <h1 className="text-4xl font-bold tracking-tight">MaintainHub</h1>
        </div>
        <p className="text-lg text-muted-foreground">Enterprise CMMS — AI-Powered</p>
      </div>

      {/* Score cards */}
      <div className="flex flex-wrap justify-center gap-3">
        {scores.map(({ label, value, max }) => (
          <div
            key={label}
            className="flex min-w-[80px] flex-col items-center rounded-xl border bg-card px-4 py-3 shadow-sm"
          >
            <span className="text-xl font-bold tabular-nums">
              {value}
              <span className="text-sm font-normal text-muted-foreground">/{max}</span>
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Phase badge + CTA */}
      <div className="flex flex-col items-center gap-4">
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-3 py-1 text-sm">
          Phase 1 Complete ✓
        </Badge>

        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Enter Demo →
        </Link>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {features.map((f) => (
          <span
            key={f}
            className="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
          >
            {f}
          </span>
        ))}
      </div>
    </main>
  )
}
