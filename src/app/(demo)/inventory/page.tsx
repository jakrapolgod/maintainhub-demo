"use client"

import { useState } from "react"
import { Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { spareParts, type SparePart } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const CAT_COLOR: Record<string, string> = {
  Mechanical: "bg-blue-100 text-blue-800",
  Electrical: "bg-yellow-100 text-yellow-800",
  Consumable: "bg-green-100 text-green-800",
}
const CATS = ["All", "Mechanical", "Electrical", "Consumable"] as const
const BASE_VALUE = spareParts.reduce((s, p) => s + p.quantity * p.unitCost, 0)

export default function InventoryPage() {
  const [parts, setParts] = useState(spareParts)
  const [cat, setCat] = useState("All")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [adj, setAdj] = useState<SparePart | null>(null)
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState("")

  const lowCount = parts.filter(p => p.quantity <= p.minStock).length
  const totalVal = parts.reduce((s, p) => s + p.quantity * p.unitCost, 0)
  const rows = parts
    .filter(p => cat === "All" || p.category === cat)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.partNumber.toLowerCase().includes(search.toLowerCase()))

  const applyAdj = () => {
    if (!adj || !reason) return
    setParts(prev => prev.map(p => p.partNumber === adj.partNumber ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p))
    setAdj(null); setDelta(0); setReason("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1.5 size-4" />Add Part</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([["Total SKUs", "10"], ["Low Stock", lowCount, true], ["Total Value", `฿${totalVal.toLocaleString()}`]] as const).map(([label, val, red]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("mt-0.5 text-xl font-semibold", red && "text-red-600")}>{val}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={cn("rounded-full px-3 py-1 text-sm font-medium transition-colors",
              cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            {c}
          </button>
        ))}
        <Input placeholder="Search name / part #…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-48 text-sm" />
      </div>

      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground">
          {["Part #", "Name", "Category", "Qty", "Min", "Unit Cost", "Location", ""].map(h => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map(p => (
            <tr key={p.partNumber} className={cn("transition-colors", p.quantity <= p.minStock ? "bg-amber-50" : "hover:bg-muted/40")}>
              <td className="py-2 pr-3 font-mono text-xs">{p.partNumber}</td>
              <td className="py-2 pr-3">{p.name}</td>
              <td className="py-2 pr-3"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", CAT_COLOR[p.category])}>{p.category}</span></td>
              <td className={cn("py-2 pr-3 font-semibold", p.quantity <= p.minStock && "text-red-600")}>{p.quantity}</td>
              <td className="py-2 pr-3 text-muted-foreground">{p.minStock}</td>
              <td className="py-2 pr-3">฿{p.unitCost.toLocaleString()}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{p.location}</td>
              <td className="py-2"><Button variant="outline" size="sm" onClick={() => { setAdj(p); setDelta(0) }}>Adjust</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Part</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Part creation form — coming soon.</p>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog open={!!adj} onOpenChange={v => !v && setAdj(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Stock — {adj?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setDelta(d => d - 1)}><Minus className="size-4" /></Button>
              <Input type="number" value={delta} onChange={e => setDelta(Number(e.target.value))} className="w-24 text-center" />
              <Button variant="outline" size="icon" onClick={() => setDelta(d => d + 1)}><Plus className="size-4" /></Button>
              <span className="text-xs text-muted-foreground">current: {adj?.quantity} → new: {Math.max(0, (adj?.quantity ?? 0) + delta)}</span>
            </div>
            <Input placeholder="Reason (e.g. used in WO-003)" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdj(null)}>Cancel</Button>
            <Button onClick={applyAdj} disabled={delta === 0 || !reason}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
