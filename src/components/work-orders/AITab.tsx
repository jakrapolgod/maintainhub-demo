'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { assets, type WorkOrder } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'ai'; text: string }

const AI_REPLY = (title: string) =>
  `วิเคราะห์ปัญหาเสร็จแล้ว 🔧\n\nจาก input ของคุณ ผมแนะนำ WO นี้:\n\n📋 **${title}**\nType: CORRECTIVE · Priority: HIGH\nกำหนดส่ง: 3 วัน`

interface Props {
  onCreated: (wo: WorkOrder) => void
}

export function AITab({ onCreated }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'ai', text: 'อธิบายปัญหาที่พบ ระบบจะสร้าง Work Order ให้อัตโนมัติ 🤖' },
  ])
  const [input, setInput] = useState('')
  const [assetId, setAssetId] = useState('')
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState<WorkOrder | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typing, draft])

  function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    setDraft(null)
    setMsgs((p) => [...p, { role: 'user', text }])
    setTyping(true)
    setTimeout(() => {
      const asset =
        assets.find((a) => a.id === assetId) ?? assets.find((a) => a.nodeType === 'EQUIPMENT')!
      const title = `แก้ไข: ${text.slice(0, 48)}`
      const wo: WorkOrder = {
        id: `WO-AI-${Date.now()}`,
        title,
        assetId: asset.id,
        status: 'OPEN',
        priority: 'HIGH',
        type: 'CORRECTIVE',
        assignedTo: 'u3',
        createdAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        description: text,
        laborEntries: [],
        partUsages: [],
        comments: [],
      }
      setTyping(false)
      setMsgs((p) => [...p, { role: 'ai', text: AI_REPLY(title) }])
      setDraft(wo)
    }, 1500)
  }

  const equipAssets = assets.filter((a) => a.nodeType === 'EQUIPMENT')

  return (
    <div className="flex flex-col gap-3">
      {/* Chat area */}
      <div className="max-h-[280px] min-h-[220px] overflow-y-auto space-y-2 rounded-lg bg-muted/30 p-3">
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line',
                m.role === 'user' ? 'bg-blue-500 text-white' : 'border bg-background',
              )}
            >
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl border bg-background px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* WO Draft preview */}
      {draft && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <p className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-400">📋 WO Draft</p>
          <p className="text-sm font-medium">{draft.title}</p>
          <div className="mt-1.5 flex gap-1.5">
            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
              CORRECTIVE
            </span>
            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700">
              HIGH
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Asset: {equipAssets.find((a) => a.id === draft.assetId)?.name} · Est: 2 hrs
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => onCreated(draft)}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
            >
              ✓ สร้าง WO นี้
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              ✎ แก้ไข
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="space-y-2">
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">เลือก Asset (ไม่บังคับ)...</option>
          {equipAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tag} — {a.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="เช่น: ปั๊ม P-001 มีเสียงดังผิดปกติ น้ำมันรั่ว..."
            className="min-h-[68px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="self-end rounded-md bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
