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
import { workOrders, assets, pmSchedules, spareParts } from '@/lib/mock-data'

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const q = query.toLowerCase()

  const matchedWOs = workOrders.filter(
    (w) => !q || w.title.toLowerCase().includes(q) || w.id.toLowerCase().includes(q),
  )
  const matchedAssets = assets.filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q),
  )
  const matchedPMs = pmSchedules.filter(
    (p) => !q || p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
  )
  const matchedParts = spareParts.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q),
  )

  const hasResults =
    matchedWOs.length + matchedAssets.length + matchedPMs.length + matchedParts.length > 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search work orders, assets, PM schedules, parts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!hasResults && <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>}

        {matchedWOs.length > 0 && (
          <CommandGroup heading="Work Orders">
            {matchedWOs.map((wo) => {
              const woBadgeVariant: Record<string, 'secondary' | 'default' | 'outline'> = {
                COMPLETED: 'secondary',
                IN_PROGRESS: 'default',
                OPEN: 'outline',
              }
              return (
                <CommandItem
                  key={wo.id}
                  value={`wo-${wo.id}-${wo.title}`}
                  onSelect={() => go(`/work-orders/${wo.id}`)}
                >
                  <ClipboardList className="shrink-0 text-muted-foreground" />
                  <span className="font-medium text-xs text-muted-foreground w-20 shrink-0">
                    {wo.id.toUpperCase()}
                  </span>
                  <span className="truncate flex-1">{wo.title}</span>
                  <Badge
                    variant={woBadgeVariant[wo.status] ?? 'outline'}
                    className="ml-auto shrink-0 text-[10px]"
                  >
                    {wo.status.replace('_', ' ')}
                  </Badge>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {matchedWOs.length > 0 && matchedAssets.length > 0 && <CommandSeparator />}

        {matchedAssets.length > 0 && (
          <CommandGroup heading="Assets">
            {matchedAssets.map((a) => (
              <CommandItem
                key={a.id}
                value={`asset-${a.id}-${a.name}`}
                onSelect={() => go(`/assets/${a.id}`)}
              >
                <Settings2 className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-xs text-muted-foreground w-20 shrink-0">
                  {a.tag}
                </span>
                <span className="truncate flex-1">{a.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedAssets.length > 0 && matchedPMs.length > 0 && <CommandSeparator />}

        {matchedPMs.length > 0 && (
          <CommandGroup heading="PM Schedules">
            {matchedPMs.map((pm) => (
              <CommandItem
                key={pm.id}
                value={`pm-${pm.id}-${pm.title}`}
                onSelect={() => go(`/pm-schedules`)}
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

        {matchedPMs.length > 0 && matchedParts.length > 0 && <CommandSeparator />}

        {matchedParts.length > 0 && (
          <CommandGroup heading="Parts">
            {matchedParts.map((p) => (
              <CommandItem
                key={p.partNumber}
                value={`part-${p.partNumber}-${p.name}`}
                onSelect={() => go(`/inventory`)}
              >
                <Package2 className="shrink-0 text-muted-foreground" />
                <span className="font-medium text-xs text-muted-foreground w-20 shrink-0">
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
