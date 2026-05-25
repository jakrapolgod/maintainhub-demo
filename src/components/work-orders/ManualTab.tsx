'use client'

import { useState } from 'react'
import { assets, teamUsers, type WorkOrder, type WOType, type WOPriority } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TYPES: WOType[] = ['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']
const PRIS: Array<{ v: WOPriority; dot: string }> = [
  { v: 'CRITICAL', dot: 'bg-red-500' },
  { v: 'HIGH', dot: 'bg-orange-500' },
  { v: 'MEDIUM', dot: 'bg-blue-500' },
  { v: 'LOW', dot: 'bg-gray-400' },
]
const techs = teamUsers.filter((u) => u.role === 'TECHNICIAN' || u.role === 'CONTRACTOR')
const equipAssets = assets.filter((a) => a.nodeType === 'EQUIPMENT')

// Shared input className
const inp =
  'w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}

interface Props {
  onCreated: (wo: WorkOrder) => void
  onCancel: () => void
}

export function ManualTab({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WOType | ''>('')
  const [priority, setPriority] = useState<WOPriority | ''>('')
  const [assetId, setAssetId] = useState('')
  const [assetQ, setAssetQ] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [desc, setDesc] = useState('')
  const [estHrs, setEstHrs] = useState('')

  const valid = !!title && !!type && !!priority && !!assetId
  const filtered = assetQ
    ? equipAssets.filter((a) => `${a.tag} ${a.name}`.toLowerCase().includes(assetQ.toLowerCase()))
    : []

  function submit() {
    if (!valid) return
    onCreated({
      id: `WO-AI-${Date.now()}`,
      title,
      assetId,
      status: 'OPEN',
      priority: priority as WOPriority,
      type: type as WOType,
      assignedTo: assignees[0] ?? '',
      createdAt: new Date().toISOString(),
      dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      description: desc,
      laborEntries: [],
      partUsages: [],
      comments: [],
    })
  }

  const toggle = (id: string) =>
    setAssignees((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <div className="flex flex-col gap-4">
      <Field label="ชื่องาน *">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่องาน..."
          className={inp}
        />
      </Field>

      <Field label="ประเภท *">
        <select value={type} onChange={(e) => setType(e.target.value as WOType)} className={inp}>
          <option value="">เลือกประเภท...</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ความสำคัญ *">
        <div className="flex flex-wrap gap-2">
          {PRIS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPriority(p.v)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                priority === p.v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              <span className={cn('size-2 rounded-full', p.dot)} />
              {p.v}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Asset *">
        <input
          value={assetQ}
          onChange={(e) => {
            setAssetQ(e.target.value)
            setAssetId('')
          }}
          placeholder="ค้นหา Asset..."
          className={inp}
        />
        {assetQ && !assetId && filtered.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filtered.slice(0, 5).map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAssetId(a.id)
                  setAssetQ(`${a.tag} — ${a.name}`)
                }}
                className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="font-mono text-xs text-muted-foreground">{a.tag}</span> {a.name}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="ผู้รับผิดชอบ">
        <div className="flex flex-wrap gap-2">
          {techs.map((u) => (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              title={u.name}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                assignees.includes(u.id)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-muted text-muted-foreground hover:border-primary/50',
              )}
            >
              {u.avatar}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันกำหนดส่ง">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inp}
          />
        </Field>
        <Field label="ชั่วโมงประมาณ">
          <input
            type="number"
            step="0.5"
            min="0"
            value={estHrs}
            onChange={(e) => setEstHrs(e.target.value)}
            placeholder="0.0"
            className={inp}
          />
        </Field>
      </div>

      <Field label="รายละเอียด">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          className={cn(inp, 'resize-none')}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t pt-3">
        <button
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted"
        >
          ยกเลิก
        </button>
        <button
          onClick={submit}
          disabled={!valid}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          สร้าง Work Order
        </button>
      </div>
    </div>
  )
}
