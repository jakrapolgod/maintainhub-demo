/**
 * Stacked avatar row for WO assignees.
 * Shows up to `max` avatars and a "+N more" overflow badge.
 */
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { UserStub } from '@/lib/api/work-orders'

interface AssigneeAvatarsProps {
  assignees: UserStub[]
  max?: number
  size?: 'sm' | 'md'
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
}

export function AssigneeAvatars({ assignees, max = 3, size = 'sm' }: AssigneeAvatarsProps) {
  if (assignees.length === 0) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>
  }

  const visible = assignees.slice(0, max)
  const overflow = assignees.length - max
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'

  return (
    <div className="flex -space-x-1.5">
      {visible.map((u) => (
        <Avatar key={u.id} className={`${dim} ring-2 ring-background`} title={u.name}>
          {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
          <AvatarFallback>{initials(u.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div
          className={`${dim} flex items-center justify-center rounded-full bg-muted ring-2 ring-background text-[10px] font-medium text-muted-foreground`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
