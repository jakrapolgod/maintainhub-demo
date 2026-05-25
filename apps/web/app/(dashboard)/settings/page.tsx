'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Key,
  Shield,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string
  name: string
  prefix: string
  created: string
  lastUsed: string
}

interface GroupMapping {
  id: string
  adGroup: string
  role: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_KEYS: ApiKey[] = [
  {
    id: '1',
    name: 'Production Integration',
    prefix: 'mh_sk...4f2a',
    created: '2024-11-01',
    lastUsed: '2025-05-20',
  },
  {
    id: '2',
    name: 'CI/CD Pipeline',
    prefix: 'mh_sk...9c31',
    created: '2025-01-15',
    lastUsed: '2025-05-22',
  },
]

const INITIAL_MAPPINGS: GroupMapping[] = [
  { id: '1', adGroup: 'CN=Maintenance,OU=Groups,DC=corp,DC=local', role: 'Technician' },
  { id: '2', adGroup: 'CN=Supervisors,OU=Groups,DC=corp,DC=local', role: 'Supervisor' },
]

const TIMEZONES = ['Asia/Bangkok', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'UTC']

const ROLES = ['Admin', 'Supervisor', 'Technician', 'Viewer']

function randomHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// ─── API Keys tab ─────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_KEYS)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null)

  function handleGenerate() {
    if (!newKeyName.trim()) return
    const secret = `mh_sk_live_${randomHex(24)}`
    setGeneratedKey(secret)
    const prefix = `mh_sk...${secret.slice(-4)}`
    setKeys((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: newKeyName.trim(),
        prefix,
        created: new Date().toISOString().slice(0, 10),
        lastUsed: '—',
      },
    ])
  }

  function handleCloseGenerate() {
    setGenerateOpen(false)
    setNewKeyName('')
    setGeneratedKey(null)
  }

  function handleRevoke() {
    if (!revokeKey) return
    setKeys((prev) => prev.filter((k) => k.id !== revokeKey.id))
    toast.success(`API key "${revokeKey.name}" revoked`)
    setRevokeKey(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            API keys grant programmatic access. Keep them secret.
          </p>
        </div>
        <Button size="sm" onClick={() => setGenerateOpen(true)}>
          <Key className="mr-1.5 h-3.5 w-3.5" />
          Generate Key
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              {['Name', 'Key prefix', 'Created', 'Last used', ''].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}</td>
                <td className="px-4 py-3 text-muted-foreground">{k.created}</td>
                <td className="px-4 py-3 text-muted-foreground">{k.lastUsed}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setRevokeKey(k)}
                  >
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generate Key dialog */}
      <Dialog
        open={generateOpen}
        onOpenChange={(o) => {
          if (!o) handleCloseGenerate()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
          </DialogHeader>

          {!generatedKey ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Key name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Production Integration"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate()
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseGenerate}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={!newKeyName.trim()}>
                  Generate
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm font-medium">
                  Save this key now — it won&apos;t be shown again.
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label>Your new API key</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedKey} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedKey)
                      toast.success('Copied to clipboard')
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseGenerate}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm dialog */}
      <Dialog
        open={!!revokeKey}
        onOpenChange={(o) => {
          if (!o) setRevokeKey(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              Revoke{' '}
              <span className="font-medium text-foreground">&quot;{revokeKey?.name}&quot;</span>?
              Any integrations using this key will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeKey(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── SSO tab ──────────────────────────────────────────────────────────────────

function SsoTab() {
  const [idpEntityId, setIdpEntityId] = useState('')
  const [ssoUrl, setSsoUrl] = useState('')
  const [certificate, setCertificate] = useState('')
  const [mappings, setMappings] = useState<GroupMapping[]>(INITIAL_MAPPINGS)

  function addRow() {
    setMappings((prev) => [...prev, { id: Date.now().toString(), adGroup: '', role: 'Technician' }])
  }

  function removeRow(id: string) {
    setMappings((prev) => prev.filter((m) => m.id !== id))
  }

  function updateRow(id: string, field: keyof GroupMapping, value: string) {
    setMappings((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)))
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="rounded-lg border bg-muted/20 p-5">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="secondary" className="gap-1.5">
            <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
            Not configured
          </Badge>
          <span className="text-sm text-muted-foreground">SAML 2.0 / OIDC SSO</span>
        </div>
        <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
          <li>Download the MaintainHub Service Provider metadata XML</li>
          <li>Register the SP in your Identity Provider (Okta, Azure AD, ADFS, etc.)</li>
          <li>Paste the IdP Entity ID, SSO URL, and X.509 certificate below</li>
          <li>
            Click <strong className="text-foreground">Save</strong> then{' '}
            <strong className="text-foreground">Test SSO</strong>
          </li>
        </ol>
      </div>

      {/* IdP config form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="idp-entity-id">IdP Entity ID</Label>
          <Input
            id="idp-entity-id"
            placeholder="https://your-idp.example.com/saml/metadata"
            value={idpEntityId}
            onChange={(e) => setIdpEntityId(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sso-url">SSO URL</Label>
          <Input
            id="sso-url"
            placeholder="https://your-idp.example.com/saml/sso"
            value={ssoUrl}
            onChange={(e) => setSsoUrl(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="certificate">X.509 Certificate</Label>
          <Textarea
            id="certificate"
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            rows={5}
            value={certificate}
            onChange={(e) => setCertificate(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => toast.success('SSO configuration saved')}>
            Save
          </Button>
          <span title="Connect your IdP first before testing">
            <Button size="sm" variant="outline" disabled>
              Test SSO
            </Button>
          </span>
          <p className="self-center text-xs text-muted-foreground">
            (Save and configure your IdP first)
          </p>
        </div>
      </div>

      {/* Group mappings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Group Mapping</Label>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add row
          </Button>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  AD Group
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Role
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No mappings. Add a row to get started.
                  </td>
                </tr>
              )}
              {mappings.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Input
                      value={m.adGroup}
                      placeholder="CN=Group,OU=...,DC=corp,DC=local"
                      onChange={(e) => updateRow(m.id, 'adGroup', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 w-36">
                    <Select value={m.role} onValueChange={(v) => updateRow(m.id, 'role', v)}>
                      <SelectTrigger className="h-8 text-xs">
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
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── General tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const [tenantName, setTenantName] = useState('Acme Corp')
  const [timezone, setTimezone] = useState('Asia/Bangkok')
  const [language, setLanguage] = useState<'th' | 'en'>('en')

  function handleSave() {
    toast.success('Settings saved')
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="tenant-name">Tenant name</Label>
        <Input
          id="tenant-name"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Displayed in the top bar and on reports.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Language</Label>
        <div className="flex flex-col gap-2">
          {(
            [
              { value: 'en', label: 'English' },
              { value: 'th', label: 'ภาษาไทย (Thai)' },
            ] as const
          ).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="language"
                value={value}
                checked={language === value}
                onChange={() => setLanguage(value)}
                className="accent-primary h-4 w-4"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={handleSave}>Save Changes</Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace configuration.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="api-keys">
          <TabsList className="mb-6">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="sso">SSO</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys">
            <ApiKeysTab />
          </TabsContent>

          <TabsContent value="sso">
            <SsoTab />
          </TabsContent>

          <TabsContent value="general">
            <GeneralTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
