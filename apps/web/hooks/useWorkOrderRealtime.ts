/**
 * Socket.io real-time hook for work-order detail views.
 *
 * ## Connection lifecycle
 *
 * A single Socket.io connection is created when the hook mounts and torn down
 * when it unmounts.  The client authenticates using the access token from
 * `tokenStore` and joins the room `wo:{workOrderId}` immediately after
 * connecting.
 *
 * ## Events handled
 *
 *   comment:added — appends the new comment to the `comments` query cache
 *                   (no server roundtrip needed — the payload contains the
 *                   full comment object emitted by the POST /:id/comments route)
 *
 *   wo:updated    — invalidates the detail query so the full WO is refetched
 *                   (used when status / assignee changes arrive from other sessions)
 *
 *   wo:assigned   — shows a toast notification and invalidates the detail query
 *
 * ## Reconnection
 *
 * Socket.io's built-in exponential back-off handles reconnection automatically.
 * The `reconnected` event rejoins the WO room so no events are missed after
 * a network blip.
 *
 * ## Multiple instances
 *
 * This hook is designed to be used once per WO detail page.  If multiple
 * components on the same page need real-time updates, wrap them in a context
 * provider that calls this hook once at the top level.
 */
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { io, type Socket } from 'socket.io-client'
import { tokenStore } from '@/lib/api'
import { workOrderKeys } from './useWorkOrders'
import type { Comment, WorkOrderDetail } from '@/lib/api/work-orders'

// ── Environment ───────────────────────────────────────────────────────────────

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  // Default: same origin as the API but without the /api/v1 path prefix
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1$/, '')

// ── Server event payload types ────────────────────────────────────────────────

interface CommentAddedPayload {
  workOrderId: string
  comment: {
    id: string
    body: string
    authorId: string
    authorName: string
    authorAvatarUrl: string | null
    mentions: string[]
    createdAt: string
  }
}

interface WoUpdatedPayload {
  workOrderId: string
  changes: Record<string, unknown>
}

interface WoAssignedPayload {
  workOrderId: string
  technicianName: string
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseWorkOrderRealtimeOptions {
  /**
   * Called when a `comment:added` event arrives.
   * Defaults to appending the comment to the TanStack Query cache.
   */
  onCommentAdded?: (payload: CommentAddedPayload) => void

  /**
   * Called when a `wo:updated` event arrives.
   * Defaults to invalidating the detail query.
   */
  onWoUpdated?: (payload: WoUpdatedPayload) => void

  /**
   * Called when a `wo:assigned` event arrives.
   * Defaults to showing a toast and invalidating the detail query.
   */
  onWoAssigned?: (payload: WoAssignedPayload) => void

  /** Disable the hook without unmounting (useful when id is not yet known). */
  enabled?: boolean
}

/**
 * Connects to the Socket.io server, joins room `wo:{workOrderId}`, and wires
 * up real-time event handlers for comment, update, and assignment events.
 *
 * @param workOrderId - The work-order CUID to subscribe to.
 */
export function useWorkOrderRealtime(
  workOrderId: string | null | undefined,
  options: UseWorkOrderRealtimeOptions = {},
): void {
  const qc = useQueryClient()
  const socketRef = useRef<Socket | null>(null)
  const { enabled = true } = options

  useEffect(() => {
    if (!workOrderId || !enabled) return

    const token = tokenStore.get()

    // Create the Socket.io client
    const socket: Socket = io(WS_URL, {
      auth: { token: token ?? '' },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1_000,
    })

    socketRef.current = socket

    // ── Connection events ──────────────────────────────────────────────────
    socket.on('connect', () => {
      socket.emit('join:wo', { workOrderId })
    })

    socket.on('reconnect', () => {
      // Rejoin the room after a reconnection so no events are missed
      socket.emit('join:wo', { workOrderId })
      // Invalidate the detail query to catch anything received while offline
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(workOrderId) })
    })

    socket.on('connect_error', (err) => {
      // Silently log — Socket.io will retry automatically
      if (process.env.NODE_ENV === 'development') {
        console.warn('[WO realtime] Connection error:', err.message)
      }
    })

    // ── comment:added ──────────────────────────────────────────────────────
    socket.on('comment:added', (payload: CommentAddedPayload) => {
      if (options.onCommentAdded) {
        options.onCommentAdded(payload)
        return
      }

      // Default: append comment to the comments cache without a server roundtrip
      qc.setQueryData<Comment[]>(workOrderKeys.comments(workOrderId), (old) => {
        if (!old) return old
        // Deduplicate in case the author's own POST response arrived first
        const exists = old.some((c) => c.id === payload.comment.id)
        if (exists) return old
        return [
          ...old,
          {
            id: payload.comment.id,
            body: payload.comment.body,
            authorId: payload.comment.authorId,
            authorName: payload.comment.authorName,
            authorAvatarUrl: payload.comment.authorAvatarUrl,
            createdAt: payload.comment.createdAt,
            updatedAt: payload.comment.createdAt,
          },
        ]
      })

      // Also keep the detail cache's embedded comments list in sync
      qc.setQueryData<WorkOrderDetail>(workOrderKeys.detail(workOrderId), (old) => {
        if (!old) return old
        const exists = old.comments.some((c) => c.id === payload.comment.id)
        if (exists) return old
        return {
          ...old,
          comments: [
            ...old.comments,
            {
              id: payload.comment.id,
              body: payload.comment.body,
              authorId: payload.comment.authorId,
              authorName: payload.comment.authorName,
              authorAvatarUrl: payload.comment.authorAvatarUrl,
              createdAt: payload.comment.createdAt,
              updatedAt: payload.comment.createdAt,
            },
          ],
        }
      })
    })

    // ── wo:updated ─────────────────────────────────────────────────────────
    socket.on('wo:updated', (payload: WoUpdatedPayload) => {
      if (options.onWoUpdated) {
        options.onWoUpdated(payload)
        return
      }
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(workOrderId) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
    })

    // ── wo:assigned ────────────────────────────────────────────────────────
    socket.on('wo:assigned', (payload: WoAssignedPayload) => {
      if (options.onWoAssigned) {
        options.onWoAssigned(payload)
        return
      }
      toast.info(`${payload.technicianName} has been assigned to this work order`)
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(workOrderId) })
    })

    return () => {
      socket.emit('leave:wo', { workOrderId })
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options callbacks are intentionally not in deps to avoid reconnecting on every render; callers should memoize them
  }, [workOrderId, enabled, qc])
}

// ── Utility: manual disconnect ────────────────────────────────────────────────

/**
 * Returns the current Socket.io socket for the last `useWorkOrderRealtime`
 * call in this component tree.  Useful for emitting custom events or
 * inspecting connection state.
 */
export function useWorkOrderSocket(
  workOrderId: string | null | undefined,
  enabled = true,
): Socket | null {
  const ref = useRef<Socket | null>(null)

  useEffect(() => {
    if (!workOrderId || !enabled) return

    const token = tokenStore.get()
    const socket = io(WS_URL, {
      auth: { token: token ?? '' },
      transports: ['websocket', 'polling'],
    })

    ref.current = socket
    socket.on('connect', () => socket.emit('join:wo', { workOrderId }))

    return () => {
      socket.emit('leave:wo', { workOrderId })
      socket.disconnect()
      ref.current = null
    }
  }, [workOrderId, enabled])

  return ref.current
}
