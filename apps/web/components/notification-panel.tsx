'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Bell, Package, CheckCheck } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  mockNotifications,
  type Notification,
  type NotificationType,
} from '@/lib/mock-notifications'

// ─── Icon per type ────────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  if (type === 'LOW_STOCK') return <Package className="size-4 shrink-0 text-amber-500" />
  if (type === 'WO_ASSIGNED' || type === 'PM_DUE')
    return <Bell className="size-4 shrink-0 text-blue-500" />
  return <AlertTriangle className="size-4 shrink-0 text-destructive" />
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'เพิ่งกี้'
  if (mins < 60) return `${mins} น. ที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชม. ที่แล้ว`
  return `${Math.floor(hrs / 24)} วันที่แล้ว`
}

// ─── Notification Panel (sheet) ───────────────────────────────────────────────

function NotificationPanel({
  open,
  onOpenChange,
  notifications,
  onMarkAllRead,
  onMarkRead,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  notifications: Notification[]
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
}) {
  const router = useRouter()
  const unreadCount = notifications.filter((n) => !n.isRead).length

  function handleItemClick(n: Notification) {
    onMarkRead(n.id)
    onOpenChange(false)
    router.push(n.link)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[360px] flex-col p-0">
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3 space-y-0">
          <SheetTitle className="text-base">
            การแจ้งเตือน
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={onMarkAllRead}
            >
              <CheckCheck className="size-3.5" />
              อ่านทั้งหมด
            </Button>
          )}
        </SheetHeader>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <CheckCheck className="size-8 opacity-40" />
              <p className="text-sm font-medium">ไม่มีการแจ้งเตือนใหม่ ✓</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      !n.isRead && 'bg-blue-50/60 dark:bg-blue-950/20',
                    )}
                  >
                    <span className="mt-0.5">
                      <NotifIcon type={n.type} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm leading-snug',
                          !n.isRead ? 'font-semibold' : 'font-medium text-muted-foreground',
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Bell button + panel (self-contained, drop into any layout) ───────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>(mockNotifications)
  const unreadCount = notifs.filter((n) => !n.isRead).length

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[10px] leading-none">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <NotificationPanel
        open={open}
        onOpenChange={setOpen}
        notifications={notifs}
        onMarkAllRead={() => setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })))}
        onMarkRead={(id) =>
          setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
        }
      />
    </>
  )
}
