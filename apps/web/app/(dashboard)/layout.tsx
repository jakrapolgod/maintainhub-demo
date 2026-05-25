import type { Metadata } from 'next'
import { NotificationBell } from '@/components/notification-panel'
import { SidebarNav } from '@/components/sidebar-nav'

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
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Future: Sidebar ─────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:flex-col">
        <SidebarNav />
      </aside>

      {/* ── Main content area ─────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (desktop + mobile) */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
          {/* Mobile: show logo */}
          <span className="font-bold text-sm lg:hidden">MaintainHub</span>
          {/* Spacer */}
          <div className="flex-1" />
          {/* Notification bell */}
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
