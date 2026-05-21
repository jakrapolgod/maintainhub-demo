'use client'

/**
 * AI Draft Drawer — right-side panel for creating WOs via natural language.
 *
 * Flow:
 *   1. User types a message → hits Send
 *   2. useDraftFromNL mutation calls POST /work-orders/ai/draft
 *   3. Draft card renders with Confirm / Edit / Discard actions
 *   4. Confirm → calls createWorkOrder → closes drawer → navigates to detail
 *   5. Edit → transitions to manual form pre-filled with draft values
 */
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X, CheckCircle, Pencil, Trash2, Loader2, Bot, User } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PriorityBadge, StatusBadge } from '@/components/work-orders/wo-badges'

import { useDraftFromNL, useCreateWorkOrder } from '@/hooks/useWorkOrders'
import type { WorkOrderDraft, WOType, WOPriority } from '@/lib/api/work-orders'

interface AIDraftDrawerProps {
  open: boolean
  onClose: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function AIDraftDrawer({ open, onClose }: AIDraftDrawerProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Describe the maintenance issue and I'll create a work order for you. Include the asset name, symptoms, and urgency.",
    },
  ])
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const draftMutation = useDraftFromNL()
  const createMutation = useCreateWorkOrder()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft])

  function handleReset() {
    setDraft(null)
    setInput('')
    setMessages([
      {
        role: 'assistant',
        content: "Describe the maintenance issue and I'll create a work order for you.",
      },
    ])
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || draftMutation.isPending) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    draftMutation.mutate(
      { message: text },
      {
        onSuccess: (d) => {
          setDraft(d)
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `I've created a draft work order. Review it below and confirm, edit, or discard.`,
            },
          ])
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Sorry, I couldn't generate a draft: ${err instanceof Error ? err.message : 'Unknown error'}`,
            },
          ])
        },
      },
    )
  }

  async function handleConfirm() {
    if (!draft) return
    createMutation.mutate(
      {
        title: draft.title,
        description: draft.description,
        type: draft.type as WOType,
        priority: draft.priority as WOPriority,
        assetId: draft.assetId ?? '',
      },
      {
        onSuccess: (result) => {
          toast.success(`Work order ${result.woNumber} created!`)
          onClose()
          router.push(`/work-orders/${result.id}`)
        },
      },
    )
  }

  function handleEdit() {
    if (!draft) return
    const params = new URLSearchParams({
      title: draft.title,
      description: draft.description,
      type: draft.type,
      priority: draft.priority,
      ...(draft.assetId && { assetId: draft.assetId }),
    })
    router.push(`/work-orders/new?${params.toString()}&mode=manual`)
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-background border-l shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">AI Work Order Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            {(messages.length > 1 || draft) && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7">
                New chat
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {draftMutation.isPending && (
            <div className="flex gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Draft card */}
          {draft && (
            <Card className="border-2 border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Draft Work Order
                  </span>
                  <PriorityBadge priority={draft.priority as WOPriority} />
                </div>
                <h3 className="font-semibold leading-snug">{draft.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-3">{draft.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{draft.type}</Badge>
                  {draft.estimatedHours && (
                    <Badge variant="outline">~{draft.estimatedHours}h</Badge>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleConfirm}
                    disabled={createMutation.isPending || !draft.assetId}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleEdit} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft(null)}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {!draft.assetId && (
                  <p className="text-xs text-amber-600">
                    Asset ID missing — please edit the form to select an asset before confirming.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          <div className="flex gap-2">
            <Input
              placeholder="Describe the maintenance issue…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              disabled={draftMutation.isPending}
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!input.trim() || draftMutation.isPending}
            >
              {draftMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
            Powered by Claude · Results are suggestions — always review before saving
          </p>
        </div>
      </aside>
    </>
  )
}
