"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Bell, Package, CheckCheck } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Notification, type NotificationType } from "@/lib/mock-data"

// ─── Icon map ─────────────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  if (type === "LOW_STOCK") {
    return <Package className="size-4 shrink-0 text-amber-500" />
  }
  if (type === "WO_ASSIGNED" || type === "PM_DUE") {
    return <Bell className="size-4 shrink-0 text-blue-500" />
  }
  // WO_OVERDUE | SLA_BREACH
  return <AlertTriangle className="size-4 shrink-0 text-destructive" />
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notifications: Notification[]
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationPanel({
  open,
  onOpenChange,
  notifications,
  onMarkAllRead,
  onMarkRead,
}: NotificationPanelProps) {
  const router = useRouter()
  const unreadCount = notifications.filter((n) => !n.isRead).length

  function handleItemClick(n: Notification) {
    onMarkRead(n.id)
    onOpenChange(false)
    router.push(n.link)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[360px] flex-col p-0"
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3 space-y-0">
          <SheetTitle className="text-base">
            Notifications
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
              Mark all read
            </Button>
          )}
        </SheetHeader>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <CheckCheck className="size-8 opacity-40" />
              <p className="text-sm font-medium">All caught up ✓</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                      !n.isRead && "bg-blue-50/60 dark:bg-blue-950/20"
                    )}
                  >
                    {/* Type icon */}
                    <span className="mt-0.5">
                      <NotifIcon type={n.type} />
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm leading-snug",
                          !n.isRead ? "font-semibold" : "font-medium text-muted-foreground"
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

                    {/* Unread dot */}
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
