"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle, Plus, Trash2, Send, ExternalLink } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"

// ─── Integrations ─────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { id: "zapier",    name: "Zapier",           emoji: "⚡",  desc: "Automate workflows with 5,000+ apps",      connected: false, type: "api"   },
  { id: "make",      name: "Make",             emoji: "🔧", desc: "Build powerful automation scenarios",        connected: true,  type: "api"   },
  { id: "slack",     name: "Slack",            emoji: "💬", desc: "Send alerts and notifications to channels",  connected: true,  type: "oauth" },
  { id: "google",    name: "Google Workspace", emoji: "🔵", desc: "Sync with Drive, Calendar, and Docs",       connected: false, type: "api"   },
  { id: "microsoft", name: "Microsoft 365",   emoji: "🟦", desc: "Connect with Teams, SharePoint, and more",  connected: false, type: "api"   },
  { id: "azure",     name: "Azure AD",         emoji: "☁️",  desc: "Single sign-on via Azure Active Directory", connected: false, type: "api"   },
] as const

type Integration = typeof INTEGRATIONS[number]

function IntegrationDialog({ intg }: { intg: Integration }) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [testing, setTesting] = useState(false)

  async function handleTest() {
    if (!apiKey.trim()) return
    setTesting(true)
    await new Promise((r) => setTimeout(r, 3000))
    setTesting(false)
    setOpen(false)
    toast.success(`${intg.name} connected successfully`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={intg.connected ? "outline" : "default"} />}>
        {intg.connected ? "Configure" : "Connect"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{intg.emoji} Connect {intg.name}</DialogTitle>
        </DialogHeader>
        {intg.type === "oauth" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Authorize MaintainHub to access your {intg.name} workspace.
            </p>
            <Button className="w-full" disabled>
              <ExternalLink className="mr-2 size-4" /> Open OAuth
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              OAuth flow is disabled in demo mode
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder="Paste your API key or URL"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button className="w-full" onClick={handleTest} disabled={testing || !apiKey.trim()}>
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect MaintainHub to your existing tools and services.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((intg) => (
          <Card key={intg.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{intg.emoji}</span>
                  <span className="font-medium">{intg.name}</span>
                </div>
                <Badge variant={intg.connected ? "default" : "secondary"} className="shrink-0">
                  {intg.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{intg.desc}</p>
              <IntegrationDialog intg={intg} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  "work_order.created", "work_order.updated", "work_order.completed", "work_order.overdue",
  "asset.created",      "asset.updated",      "pm.due",               "inventory.low",
]

type Webhook = { id: string; url: string; events: number; status: "success" | "failure"; lastAt: string }

const INITIAL_WEBHOOKS: Webhook[] = [
  { id: "wh1", url: "https://hooks.zapier.com/hooks/catch/12345/abcdef/", events: 4, status: "success", lastAt: "2m ago"  },
  { id: "wh2", url: "https://n8n.company.internal/webhook/maintainhub",   events: 2, status: "failure", lastAt: "1h ago"  },
]

function AddWebhookDialog({ onAdd }: { onAdd: (wh: Webhook) => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [testResult, setTestResult] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  function toggle(ev: string) {
    setSelected((p) => p.includes(ev) ? p.filter((e) => e !== ev) : [...p, ev])
  }
  async function handleTest() {
    if (!url.trim()) return
    setSending(true)
    await new Promise((r) => setTimeout(r, 1000))
    setSending(false)
    setTestResult('HTTP 200 OK\n{"received":true,"timestamp":"2026-05-23T10:32:00Z"}')
  }
  function handleAdd() {
    if (!url.trim()) return
    onAdd({ id: `wh${Date.now()}`, url, events: selected.length || 1, status: "success", lastAt: "just now" })
    toast.success("Webhook added")
    setOpen(false)
    setUrl(""); setSelected([]); setTestResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1.5 size-4" /> Add Webhook
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Webhook</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input placeholder="https://your-endpoint.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Events</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(ev)} onChange={() => toggle(ev)} className="accent-primary" />
                  <span className="font-mono text-xs">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={sending || !url.trim()} className="w-full">
            <Send className="mr-1.5 size-3.5" /> {sending ? "Sending…" : "Send Test Payload"}
          </Button>
          {testResult && (
            <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">{testResult}</pre>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleAdd} disabled={!url.trim()}>Add Webhook</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(INITIAL_WEBHOOKS)

  function remove(id: string) {
    setWebhooks((p) => p.filter((w) => w.id !== id))
    toast.success("Webhook removed")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground">Receive real-time HTTP notifications for CMMS events.</p>
        </div>
        <AddWebhookDialog onAdd={(wh) => setWebhooks((p) => [...p, wh])} />
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Endpoint URL</th>
                <th className="px-4 py-3 font-medium">Events</th>
                <th className="px-4 py-3 font-medium">Last delivery</th>
                <th className="px-4 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-muted/40 transition-colors">
                  <td className="max-w-[260px] truncate px-4 py-3 font-mono text-xs">{wh.url}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{wh.events} event{wh.events !== 1 ? "s" : ""}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {wh.status === "success"
                        ? <CheckCircle2 className="size-3.5 text-green-500" />
                        : <Circle className="size-3.5 text-destructive" />
                      }
                      <span className="text-xs text-muted-foreground">{wh.lastAt}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(wh.id)} aria-label="Delete webhook">
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No webhooks configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Stub tabs ────────────────────────────────────────────────────────────────

function ApiKeysTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground">Manage keys for programmatic access to MaintainHub.</p>
      </div>
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">API key management coming soon.</CardContent></Card>
    </div>
  )
}

function SsoTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Single Sign-On</h2>
        <p className="text-sm text-muted-foreground">Configure SAML 2.0 or OIDC for your organization.</p>
      </div>
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">SSO configuration coming soon.</CardContent></Card>
    </div>
  )
}

function GeneralTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Workspace name, timezone, and preferences.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Workspace name</label>
            <Input defaultValue="Acme Facilities Corp" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Timezone</label>
            <Input defaultValue="America/New_York" />
          </div>
          <Button onClick={() => toast.success("Settings saved")} size="sm">Save changes</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { value: "integrations", label: "Integrations", content: <IntegrationsTab /> },
  { value: "webhooks",     label: "Webhooks",     content: <WebhooksTab />     },
  { value: "api-keys",     label: "API Keys",     content: <ApiKeysTab />      },
  { value: "sso",          label: "SSO",          content: <SsoTab />          },
  { value: "general",      label: "General",      content: <GeneralTab />      },
]

export default function SettingsPage() {
  return (
    <Tabs orientation="vertical" defaultValue="integrations" className="gap-6">
      <TabsList variant="line" className="w-40 shrink-0 self-start pt-0.5">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
