'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { type WorkOrder } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { AITab } from './AITab'
import { ManualTab } from './ManualTab'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (wo: WorkOrder) => void
}

const TABS = [
  { v: 'ai' as const, label: '✦ AI Assistant' },
  { v: 'manual' as const, label: '📋 Manual Form' },
]

export function CreateWOSheet({ open, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<'ai' | 'manual'>('ai')

  function handleCreated(wo: WorkOrder) {
    onCreated(wo)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <SheetTitle>สร้าง Work Order ใหม่</SheetTitle>

          {/* Segmented tab control */}
          <div className="mt-3 flex w-fit rounded-full bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                  tab === t.v
                    ? 'bg-white text-foreground shadow-sm dark:bg-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'ai' ? (
            <AITab onCreated={handleCreated} />
          ) : (
            <ManualTab onCreated={handleCreated} onCancel={onClose} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
