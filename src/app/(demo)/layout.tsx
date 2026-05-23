"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  CalendarClock,
  BarChart3,
  Boxes,
  Settings,
  Bell,
  Menu as MenuIcon,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react"
import { Menu } from "@base-ui/react/menu"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { DemoBanner } from "@/components/DemoBanner"
import { Toaster } from "@/components/ui/sonner"
import { NotificationPanel } from "@/components/NotificationPanel"
import { notifications as initialNotifications } from "@/lib/mock-data"
import type { Notification } from "@/lib/mock-data"

// ─── Nav config ──────────────────────────────────────────────────────────────

const navLinks = [
  { href: "/dashboard",   label: "Dashboard",    icon: LayoutDashboard },
  { href: "/work-orders", label: "Work Orders",  icon: ClipboardList   },
  { href: "/assets",      label: "Assets",       icon: Package         },
  { href: "/pm-schedules",label: "PM Schedules", icon: CalendarClock   },
  { href: "/inventory",   label: "Inventory",    icon: Boxes           },
  { href: "/analytics",   label: "Analytics",    icon: BarChart3       },
  { href: "/settings",    label: "Settings",     icon: Settings        },
] as const

const pathTitles: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/work-orders":  "Work Orders",
  "/assets":       "Assets",
  "/pm-schedules": "PM Schedules",
  "/inventory":    "Inventory",
  "/analytics":    "Analytics",
  "/settings":     "Settings",
}

// ─── Sidebar inner content (shared between desktop + mobile sheet) ────────────

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b px-5">
        <span className="text-lg font-bold tracking-tight">MaintainHub</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User avatar at bottom */}
      <div className="shrink-0 border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">John Doe</p>
            <p className="truncate text-xs text-muted-foreground">
              Maintenance Manager
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── User dropdown (top-bar) ──────────────────────────────────────────────────

function UserDropdown() {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            aria-label="User menu"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <span className="hidden sm:inline">John Doe</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-100">
            <Menu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted"
            >
              <User className="size-4 shrink-0" />
              Profile
            </Menu.Item>
            <Menu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
            >
              <LogOut className="size-4 shrink-0" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

// ─── Shell layout ─────────────────────────────────────────────────────────────

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const pageTitle = pathTitles[pathname] ?? "MaintainHub"

  // ── Notification state ──────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>(initialNotifications)
  const unreadCount = notifs.filter((n) => !n.isRead).length

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }
  function markRead(id: string) {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
  }

  return (
    <div className="flex h-full min-h-dvh flex-col bg-background">
      <DemoBanner />
      <div className="flex flex-1 min-h-0">
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden w-60 shrink-0 border-r lg:block">
        <SidebarNav pathname={pathname} />
      </aside>

      {/* ── Right column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
          {/* Mobile: hamburger → sheet sidebar */}
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />
              }
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0" showCloseButton={false}>
              <SidebarNav pathname={pathname} />
            </SheetContent>
          </Sheet>

          {/* Page title */}
          <h1 className="flex-1 truncate text-base font-semibold">{pageTitle}</h1>

          {/* Bell notification */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
            onClick={() => setNotifOpen(true)}
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[10px] leading-none">
                {unreadCount}
              </Badge>
            )}
          </Button>

          {/* User dropdown */}
          <UserDropdown />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      </div>

      <Toaster richColors position="bottom-right" />

      {/* Notification panel */}
      <NotificationPanel
        open={notifOpen}
        onOpenChange={setNotifOpen}
        notifications={notifs}
        onMarkAllRead={markAllRead}
        onMarkRead={markRead}
      />
    </div>
  )
}
