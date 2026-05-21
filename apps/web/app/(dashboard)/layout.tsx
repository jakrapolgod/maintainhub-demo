import Link from 'next/link'
import type { Metadata } from 'next'
import { Wrench, Package2, ClipboardList, LayoutDashboard, CalendarCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: { template: '%s | MaintainHub', default: 'Dashboard | MaintainHub' },
}

/**
 * Dashboard layout shell.
 *
 * Sprint-3 stub — future sprints will add:
 *   - Sidebar navigation (assets, PM schedules, inventory, reports)
 *   - Top-bar with user avatar, tenant name, notifications bell
 *   - Mobile hamburger drawer
 *
 * For now it provides the authenticated-route wrapper and a consistent
 * content area so work-order pages have a predictable parent layout.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Future: Sidebar ─────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-bold text-sm">MaintainHub</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            Dashboard
          </Link>
          <Link
            href="/work-orders"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Work Orders
          </Link>
          <Link
            href="/assets"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Package2 className="h-4 w-4 text-muted-foreground" />
            Assets
          </Link>
          <Link
            href="/pm-schedules"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            PM Schedules
          </Link>
          <Link
            href="/inventory"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ClipboardList className="h-4 w-4" />
            Inventory
          </Link>
        </nav>
      </aside>

      {/* ── Main content area ─────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center border-b px-4 lg:hidden">
          <span className="font-bold text-sm">MaintainHub</span>
        </header>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
