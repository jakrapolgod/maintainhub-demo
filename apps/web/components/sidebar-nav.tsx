'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Wrench,
  Package2,
  ClipboardList,
  LayoutDashboard,
  CalendarCheck,
  BarChart2,
  Settings,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/work-orders', label: 'Work Orders', icon: Wrench },
  { href: '/assets', label: 'Assets', icon: Package2 },
  { href: '/pm-schedules', label: 'PM Schedules', icon: CalendarCheck },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/inventory', label: 'Inventory', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

const SETTINGS_SUB = [
  { href: '/settings', label: 'General' },
  { href: '/settings/users', label: 'Users' },
] as const

function cn(...c: (string | boolean | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function SidebarNav() {
  const pathname = usePathname()
  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-bold text-sm">MaintainHub</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <div key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent',
                  active && 'bg-accent',
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </Link>
              {href === '/settings' && active && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {SETTINGS_SUB.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={cn(
                        'block rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        pathname === sub.href
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </>
  )
}
