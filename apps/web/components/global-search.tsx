'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Settings2, CalendarClock, Package2 } from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'

// ── Inline mock data (mirrors src/lib/mock-data.ts) ──────────────────────────

const WORK_ORDERS = [
  { id: 'wo1', title: 'Replace mechanical seal', status: 'OPEN' },
  { id: 'wo2', title: 'Lubricate drive belt', status: 'OPEN' },
  { id: 'wo3', title: 'Inspect pressure relief valve', status: 'IN_PROGRESS' },
  { id: 'wo4', title: 'Clean condenser coils', status: 'IN_PROGRESS' },
  { id: 'wo5', title: 'Load test under full capacity', status: 'OPEN' },
  { id: 'wo6', title: 'Replace air filter cartridge', status: 'COMPLETED' },
  { id: 'wo7', title: 'Calibrate flow sensor', status: 'COMPLETED' },
  { id: 'wo8', title: 'Tighten conveyor tensioner', status: 'COMPLETED' },
] as const

const ASSETS = [
  { id: 'a1', name: 'Pump P-001', tag: 'P-001' },
  { id: 'a2', name: 'Compressor AC-002', tag: 'AC-002' },
  { id: 'a3', name: 'Conveyor CB-003', tag: 'CB-003' },
  { id: 'a4', name: 'Cooling Tower CT-004', tag: 'CT-004' },
  { id: 'a5', name: 'Generator G-001', tag: 'G-001' },
] as const

const PM_SCHEDULES = [
  { id: 'pm1', title: 'Monthly pump inspection', isOverdue: true },
  { id: 'pm2', title: 'Quarterly compressor overhaul', isOverdue: true },
  { id: 'pm3', title: 'Monthly conveyor belt check', isOverdue: false },
  { id: 'pm4', title: 'Quarterly generator service', isOverdue: false },
  { id: 'pm5', title: 'Cooling tower inspection', isOverdue: true },
] as const

const PARTS = [
  { partNumber: 'PT-001', name: 'Bearing 6205' },
  { partNumber: 'PT-002', name: 'V-Belt B48' },
  { partNumber: 'PT-003', name: 'Oil Seal 40×60' },
  { partNumber: 'PT-004', name: 'Contactor LC1D25' },
  { partNumber: 'PT-005', name: 'Fuse 32A' },
  { partNumber: 'PT-006', name: 'Air Filter Cartridge' },
  { partNumber: 'PT-007', name: 'Hydraulic Pump Gear Set' },
  { partNumber: 'PT-010', name: 'Motor 3kW 4P' },
] as const

const WO_BADGE: Record<string, 'secondary' | 'default' | 'outline'> = {
  COMPLETED: 'secondary',
  IN_PROGRESS: 'default',
  OPEN: 'outline',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const q = query.toLowerCase()
  const matchWOs = WORK_ORDERS.filter(
    (w) => !q || w.title.toLowerCase().includes(q) || w.id.includes(q),
  )
  const matchAssets = ASSETS.filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q),
  )
  const matchPMs = PM_SCHEDULES.filter((p) => !q || p.title.toLowerCase().includes(q))
  const matchParts = PARTS.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q),
  )
  const hasResults = matchWOs.length + matchAssets.length + matchPMs.length + matchParts.length > 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search work orders, assets, PM schedules, parts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!hasResults && <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>}

        {matchWOs.length > 0 && (
          <CommandGroup heading="Work Orders">
            {matchWOs.map((wo) => (
              <CommandItem
                key={wo.id}
                value={`wo-${wo.id}-${wo.title}`}
                onSelect={() => go(`/work-orders/${wo.id}`)}
              >
                <ClipboardList className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-xs text-muted-foreground w-16 shrink-0">
                  {wo.id.toUpperCase()}
                </span>
                <span className="truncate flex-1">{wo.title}</span>
                <Badge
                  variant={WO_BADGE[wo.status] ?? 'outline'}
                  className="ml-auto shrink-0 text-[10px]"
                >
                  {wo.status.replace('_', ' ')}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchWOs.length > 0 && matchAssets.length > 0 && <CommandSeparator />}

        {matchAssets.length > 0 && (
          <CommandGroup heading="Assets">
            {matchAssets.map((a) => (
              <CommandItem
                key={a.id}
                value={`asset-${a.id}-${a.name}`}
                onSelect={() => go(`/assets/${a.id}`)}
              >
                <Settings2 className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-xs text-muted-foreground w-16 shrink-0">
                  {a.tag}
                </span>
                <span className="truncate flex-1">{a.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchAssets.length > 0 && matchPMs.length > 0 && <CommandSeparator />}

        {matchPMs.length > 0 && (
          <CommandGroup heading="PM Schedules">
            {matchPMs.map((pm) => (
              <CommandItem
                key={pm.id}
                value={`pm-${pm.id}-${pm.title}`}
                onSelect={() => go('/pm-schedules')}
              >
                <CalendarClock className="shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{pm.title}</span>
                {pm.isOverdue && (
                  <Badge variant="destructive" className="ml-auto shrink-0 text-[10px]">
                    Overdue
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchPMs.length > 0 && matchParts.length > 0 && <CommandSeparator />}

        {matchParts.length > 0 && (
          <CommandGroup heading="Parts">
            {matchParts.map((p) => (
              <CommandItem
                key={p.partNumber}
                value={`part-${p.partNumber}-${p.name}`}
                onSelect={() => go('/inventory')}
              >
                <Package2 className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-xs text-muted-foreground w-16 shrink-0">
                  {p.partNumber}
                </span>
                <span className="truncate flex-1">{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// ── Top-bar trigger (client island) ──────────────────────────────────────────

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-md border bg-background px-3 h-9 text-sm text-muted-foreground w-48 hover:bg-muted transition-colors"
        aria-label="Open search"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden sm:flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          <span>⌘</span>K
        </kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden flex items-center justify-center size-9 rounded-md hover:bg-muted transition-colors"
        aria-label="Search"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
      <GlobalSearch open={open} onOpenChange={setOpen} />
    </>
  )
}
