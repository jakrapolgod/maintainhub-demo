/**
 * AIAssistPanel — right-drawer AI work order assistant.
 *
 * ## Architecture
 *
 * The panel is a self-contained 420 px Sheet drawer.  It manages its own
 * conversation state; the parent only controls `open`/`onClose`.
 *
 * ### Message flow
 *
 *   1. User types (or dictates via Web Speech API) and sends a message.
 *   2. `handleSend` calls `POST /work-orders/ai/draft` via `useDraftFromNL`.
 *   3. While the request is in-flight:
 *        - An optimistic user message is appended immediately.
 *        - A "typing" assistant bubble is shown.
 *   4. On success: the full assistant response text is streamed character-by-
 *      character with a ~12 ms interval to simulate token streaming even
 *      though the underlying endpoint is a regular HTTP POST.
 *   5. `WorkOrderPreview` renders below the final assistant message.
 *   6. "Create Work Order" → `useCreateWorkOrder` → navigate to detail page.
 *   7. "Edit Details" → navigates to `/work-orders/new?mode=manual&…` with
 *      the draft pre-filled as query params.
 *   8. "Start Over" → clears conversation state.
 *
 * ### Voice input
 *
 * The microphone button uses `window.SpeechRecognition` (or the webkit prefix
 * equivalent).  When the browser does not support it the button is hidden.
 * Recognition is single-shot (not continuous): one press → one utterance.
 *
 * ### Asset context
 *
 * An optional asset selector lets the user pick an asset so Claude gets
 * richer maintenance history context.  Assets are fetched lazily from
 * `GET /api/v1/assets?search=…` using a 300 ms debounce.
 */
'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  RefreshCw,
  CheckCircle,
  Pencil,
  ChevronDown,
  AlertCircle,
  Loader2,
  Bot,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityBadge } from '@/components/work-orders/PriorityBadge'

import { useDraftFromNL, useCreateWorkOrder } from '@/hooks/useWorkOrders'
import { apiFetch, API_BASE, tokenStore } from '@/lib/api'
import type { WorkOrderDraft, WOType, WOPriority } from '@/lib/api/work-orders'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'user' | 'assistant' | 'system'

interface Message {
  id: string
  role: Role
  content: string
  /** Present on the final assistant message that triggered a draft. */
  draft?: WorkOrderDraft
  /** Whether this assistant message is still being "typed". */
  typing?: boolean
}

interface AssetOption {
  id: string
  name: string
  assetNumber: string
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AIAssistPanelProps {
  open: boolean
  onClose: () => void
  /** Optional initial asset — pre-selects context without user interaction. */
  initialAssetId?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: `สวัสดี! ฉันสามารถสร้างใบสั่งงานจากภาษาธรรมชาติได้

ลองพิมพ์: *"ปั๊ม P-101 รั่วมาก ความเร่งด่วนวิกฤต"*

หรือเลือกสินทรัพย์ด้านล่างเพื่อให้บริบทดีขึ้น — ฉันจะใช้ประวัติการซ่อมบำรุงเพื่อแนะนำความเร่งด่วนและประเภทงาน`,
}

const TYPE_LABELS: Record<WOType, string> = {
  CORRECTIVE: 'งานแก้ไข',
  PREVENTIVE: 'งานป้องกัน',
  INSPECTION: 'งานตรวจสอบ',
  EMERGENCY: 'งานฉุกเฉิน',
}

const TYPE_VARIANT: Record<WOType, 'default' | 'secondary' | 'warning' | 'info' | 'destructive'> = {
  CORRECTIVE: 'secondary',
  PREVENTIVE: 'info',
  INSPECTION: 'default',
  EMERGENCY: 'destructive',
}

// ── Small utilities ───────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ── Web Speech API ────────────────────────────────────────────────────────────

type SpeechRecognitionInstance = {
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
}

type SpeechResultEvent = {
  results: { [i: number]: { [j: number]: { transcript: string } } }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const W = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return W.SpeechRecognition ?? W.webkitSpeechRecognition ?? null
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIAssistPanel({ open, onClose, initialAssetId }: AIAssistPanelProps) {
  const router = useRouter()

  // ── Conversation state ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [currentDraft, setCurrentDraft] = useState<WorkOrderDraft | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Asset context ───────────────────────────────────────────────────────────
  const [assetSearch, setAssetSearch] = useState('')
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([])
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null)
  const [assetDropOpen, setAssetDropOpen] = useState(false)
  const [assetLoading, setAssetLoading] = useState(false)
  const debouncedSearch = useDebounce(assetSearch, 300)

  // ── Voice input ─────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const SpeechRecognition = getSpeechRecognition()
  const speechSupported = SpeechRecognition !== null

  // ── Scroll refs ─────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Mutations ───────────────────────────────────────────────────────────────
  const draftMutation = useDraftFromNL()
  const createMutation = useCreateWorkOrder()

  // ── Pre-select initial asset ────────────────────────────────────────────────
  useEffect(() => {
    if (!initialAssetId || selectedAsset) return
    void apiFetch<{ id: string; name: string; assetNumber: string }>(`/assets/${initialAssetId}`)
      .then((a) => setSelectedAsset(a))
      .catch(() => {
        /* ignore if asset not found */
      })
  }, [initialAssetId, selectedAsset])

  // ── Fetch asset options ─────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setAssetOptions([])
      return
    }
    setAssetLoading(true)
    void apiFetch<{ items: AssetOption[] }>(
      `/assets?search=${encodeURIComponent(debouncedSearch)}&limit=8`,
    )
      .then((r) => setAssetOptions(r.items))
      .catch(() => setAssetOptions([]))
      .finally(() => setAssetLoading(false))
  }, [debouncedSearch])

  // ── Auto-scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Reset on close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current)
    }
  }, [open])

  // ── Simulated token streaming ───────────────────────────────────────────────
  function streamText(msgId: string, fullText: string, onDone?: () => void) {
    let pos = 0
    const CHUNK = 4 // chars per tick
    const DELAY = 12 // ms per tick

    setIsStreaming(true)

    streamTimerRef.current = setInterval(() => {
      pos = Math.min(pos + CHUNK, fullText.length)
      const slice = fullText.slice(0, pos)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: slice, typing: pos < fullText.length } : m,
        ),
      )

      if (pos >= fullText.length) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current)
        setIsStreaming(false)
        onDone?.()
      }
    }, DELAY)
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming || draftMutation.isPending) return

    setInput('')

    // 1. Append user message
    const userMsg: Message = { id: uid(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])

    // 2. Append placeholder assistant message (typing indicator)
    const assistantId = uid()
    const typingMsg: Message = { id: assistantId, role: 'assistant', content: '', typing: true }
    setMessages((prev) => [...prev, typingMsg])

    // 3. Call the API
    draftMutation.mutate(
      {
        message: text,
        ...(selectedAsset !== null && { assetId: selectedAsset.id }),
      },
      {
        onSuccess: (draft) => {
          setCurrentDraft(draft)

          // Build the full response text to stream
          const responseText = [
            `นี่คือร่างใบสั่งงานตามที่คุณอธิบาย:\n\n`,
            `**${draft.title}**\n\n`,
            draft.description,
          ].join('')

          // Start streaming, then attach the draft card when done
          streamText(assistantId, responseText, () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: responseText, typing: false, draft } : m,
              ),
            )
          })
        },
        onError: (err) => {
          const errText = err instanceof Error ? err.message : 'AI request failed'
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `⚠ ${errText}`, typing: false } : m,
            ),
          )
          setIsStreaming(false)
        },
      },
    )
  }, [input, isStreaming, draftMutation, selectedAsset])

  // ── Keyboard handler ────────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Start over ──────────────────────────────────────────────────────────────
  function handleStartOver() {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current)
    setMessages([WELCOME_MESSAGE])
    setCurrentDraft(null)
    setIsStreaming(false)
    setInput('')
    textareaRef.current?.focus()
  }

  // ── Confirm: create WO ──────────────────────────────────────────────────────
  function handleConfirm() {
    if (!currentDraft) return
    if (!currentDraft.assetId) {
      toast.warning('ยังไม่เลือกสินทรัพย์ — กรุณาแก้ไขฟอร์มเพื่อเลือกสินทรัพย์ก่อน')
      handleEdit()
      return
    }

    createMutation.mutate(
      {
        title: currentDraft.title,
        description: currentDraft.description,
        type: currentDraft.type,
        priority: currentDraft.priority,
        assetId: currentDraft.assetId,
        ...(currentDraft.estimatedHours !== undefined &&
          {
            // estimatedHours is contextual — passed via description, not a field
          }),
      },
      {
        onSuccess: (result) => {
          toast.success(`สร้างใบสั่งงาน ${result.woNumber} แล้ว!`)
          onClose()
          router.push(`/work-orders/${result.id}`)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'สร้างใบสั่งงานไม่สำเร็จ')
        },
      },
    )
  }

  // ── Edit: navigate to manual form pre-filled with draft ─────────────────────
  function handleEdit() {
    if (!currentDraft) return
    const params = new URLSearchParams({
      mode: 'manual',
      title: currentDraft.title,
      description: currentDraft.description,
      type: currentDraft.type,
      priority: currentDraft.priority,
      ...(currentDraft.assetId && { assetId: currentDraft.assetId }),
    })
    router.push(`/work-orders/new?${params.toString()}`)
    onClose()
  }

  // ── Voice input ─────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (!SpeechRecognition) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (event: SpeechResultEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setInput(transcript)
    }

    rec.onerror = (event: { error: string }) => {
      if (event.error !== 'no-speech') {
        toast.error(`Voice error: ${event.error}`)
      }
      setIsListening(false)
    }

    rec.onend = () => setIsListening(false)

    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:w-[420px] flex flex-col p-0 gap-0 overflow-hidden"
        aria-describedby="ai-panel-description"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="shrink-0 flex-row items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <SheetTitle className="text-base">ผู้ช่วย AI สร้างใบสั่งงาน</SheetTitle>
          </div>
          <div className="flex items-center gap-1">
            {(messages.length > 1 || currentDraft) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartOver}
                className="h-8 gap-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                เริ่มใหม่
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <SheetDescription id="ai-panel-description" className="sr-only">
          AI assistant for creating work orders through natural language
        </SheetDescription>

        {/* ── Message list ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Typing indicator — shown while API call is in-flight before stream starts */}
          {draftMutation.isPending && !isStreaming && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>

        {/* ── Draft action bar ─────────────────────────────────────────────── */}
        {currentDraft && !isStreaming && (
          <div className="shrink-0 border-t bg-muted/30 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">พร้อมสร้างใบสั่งงาน:</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                สร้างใบสั่งงาน
              </Button>
              <Button size="sm" variant="outline" onClick={handleEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                แก้ไข
              </Button>
              <Button size="sm" variant="ghost" onClick={handleStartOver} title="เริ่มใหม่">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {!currentDraft.assetId && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                ยังไม่เลือกสินทรัพย์ — คลิก แก้ไข เพื่อเลือกก่อนสร้าง
              </p>
            )}
          </div>
        )}

        {/* ── Footer: asset selector + input ────────────────────────────────── */}
        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-4 space-y-2.5">
          {/* Asset context selector */}
          <AssetContextSelector
            selectedAsset={selectedAsset}
            search={assetSearch}
            onSearchChange={setAssetSearch}
            options={assetOptions}
            loading={assetLoading}
            dropOpen={assetDropOpen}
            onDropOpen={setAssetDropOpen}
            onSelect={(a) => {
              setSelectedAsset(a)
              setAssetDropOpen(false)
              setAssetSearch('')
            }}
            onClear={() => setSelectedAsset(null)}
          />

          {/* Text input row */}
          <div className="flex gap-2 items-end">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                placeholder={
                  isListening ? 'กำลังฟัง… พูดได้เลย' : 'อธิบายปัญหาการซ่อมบำรุง… (Enter เพื่อส่ง)'
                }
                value={input}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={draftMutation.isPending || isStreaming}
                rows={3}
                className="resize-none text-sm pr-2"
              />
              {isListening && (
                <span className="absolute bottom-2 right-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              {/* Voice button — hidden when not supported */}
              {speechSupported && (
                <Button
                  variant={isListening ? 'destructive' : 'outline'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleVoice}
                  title={isListening ? 'หยุดฟัง' : 'รับเสียง'}
                >
                  {isListening ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}

              {/* Send button */}
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={handleSend}
                disabled={!input.trim() || draftMutation.isPending || isStreaming}
                title="ส่ง (Enter)"
              >
                {draftMutation.isPending || isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            ขับเคลื่อนโดย Claude · Shift+Enter ขึ้นบรรทัดใหม่ · ตรวจสอบก่อนบันทึกเสมอ
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isTyping = message.typing === true && !isUser

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        {isUser ? (
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        ) : (
          <AvatarFallback className="bg-violet-600 text-white text-[10px]">
            <Bot className="h-3.5 w-3.5" />
          </AvatarFallback>
        )}
      </Avatar>

      <div className={`flex flex-col gap-2 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div
          className={[
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm',
          ].join(' ')}
        >
          {isTyping ? (
            <TypingDots />
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div
              className="prose prose-sm prose-neutral max-w-none dark:prose-invert
                            [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold
                            [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:text-[12px]"
            >
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Draft preview card — only on assistant messages with a draft */}
        {message.draft && !isTyping && <WorkOrderPreview draft={message.draft} />}
      </div>
    </div>
  )
}

// ── TypingDots ────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="bg-violet-600 text-white text-[10px]">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
        <TypingDots />
      </div>
    </div>
  )
}

// ── WorkOrderPreview ──────────────────────────────────────────────────────────

function WorkOrderPreview({ draft }: { draft: WorkOrderDraft }) {
  return (
    <div className="w-full rounded-xl border-2 border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/70">
          ร่างใบสั่งงาน
        </span>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={TYPE_VARIANT[draft.type] ?? 'secondary'}
            className="text-[10px] px-1.5 py-0"
          >
            {TYPE_LABELS[draft.type] ?? draft.type}
          </Badge>
          <PriorityBadge priority={draft.priority as WOPriority} compact />
        </div>
      </div>

      <p className="text-sm font-semibold leading-snug line-clamp-2">{draft.title}</p>
      <p className="text-xs text-muted-foreground line-clamp-3">{draft.description}</p>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {draft.estimatedHours !== undefined && <span>~{draft.estimatedHours}h ประมาณ</span>}
        {draft.suggestedAssignees && draft.suggestedAssignees.length > 0 && (
          <span>ทักษะ: {draft.suggestedAssignees.join(', ')}</span>
        )}
        {!draft.assetId && <span className="text-amber-600">⚠ ยังไม่เลือกสินทรัพย์</span>}
      </div>
    </div>
  )
}

// ── AssetContextSelector ──────────────────────────────────────────────────────

interface AssetContextSelectorProps {
  selectedAsset: AssetOption | null
  search: string
  onSearchChange: (v: string) => void
  options: AssetOption[]
  loading: boolean
  dropOpen: boolean
  onDropOpen: (v: boolean) => void
  onSelect: (a: AssetOption) => void
  onClear: () => void
}

function AssetContextSelector({
  selectedAsset,
  search,
  onSearchChange,
  options,
  loading,
  dropOpen,
  onDropOpen,
  onSelect,
  onClear,
}: AssetContextSelectorProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onDropOpen(!dropOpen)}
        className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors"
      >
        <span className="text-muted-foreground">Asset context:</span>
        <span className={selectedAsset ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          {selectedAsset
            ? `${selectedAsset.assetNumber} — ${selectedAsset.name}`
            : 'ไม่ระบุ (ไม่บังคับ)'}
        </span>
        <div className="flex items-center gap-1 ml-1">
          {selectedAsset && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  onClear()
                }
              }}
              className="rounded-full hover:bg-muted p-0.5 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dropOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {dropOpen && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-md border bg-popover shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              placeholder="ค้นหาสินทรัพย์…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-sm border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : options.length > 0 ? (
              options.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="text-xs font-medium">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">{a.assetNumber}</p>
                  </div>
                </button>
              ))
            ) : search.length >= 2 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">ไม่พบสินทรัพย์</p>
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                พิมพ์ 2 ตัวอักษรขึ้นไปเพื่อค้นหา
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
