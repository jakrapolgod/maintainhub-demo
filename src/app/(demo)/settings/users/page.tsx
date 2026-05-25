'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { teamUsers, type TeamUser, type UserRole } from '@/lib/mock-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  TECHNICIAN: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-600',
  CONTRACTOR: 'bg-amber-100 text-amber-700',
}
const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER', 'CONTRACTOR']

export default function UsersPage() {
  const [users, setUsers] = useState(teamUsers)
  const [filter, setFilter] = useState<UserRole | 'ALL'>('ALL')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('VIEWER')
  const [open, setOpen] = useState(false)

  const filtered = filter === 'ALL' ? users : users.filter((u) => u.role === filter)

  function toggleStatus(id: string) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } : u,
      ),
    )
  }
  function changeRole(id: string, role: UserRole) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
  }
  function sendInvite() {
    if (!inviteEmail.trim()) return
    setOpen(false)
    setInviteEmail('')
    toast.success('Invitation sent')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Members</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}>Invite User</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={sendInvite}>Send Invitation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', ...ROLES] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors border',
              filter === r
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {['Member', 'Email', 'Role', 'Status', 'Last Login', 'Skills', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((u: TeamUser) => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarFallback className="text-xs">{u.avatar}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2.5">
                  <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as UserRole)}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-xs font-medium',
                              ROLE_COLORS[r],
                            )}
                          >
                            {r}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        u.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300',
                      )}
                    />
                    <span className="text-xs">{u.status}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {new Date(u.lastLogin).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.skills.slice(0, 2).map((s) => (
                      <Badge key={s} variant="outline" className="text-xs px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                    {u.skills.length > 2 && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        +{u.skills.length - 2}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Button
                    size="sm"
                    variant={u.status === 'ACTIVE' ? 'destructive' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => toggleStatus(u.id)}
                  >
                    {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
