'use client'

import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Category = 'Mechanical' | 'Electrical' | 'Consumable'
interface Part {
  partNumber: string
  name: string
  category: Category
  quantity: number
  minStock: number
  unitCost: number
  location: string
}

const SEED: Part[] = [
  {
    partNumber: 'PT-001',
    name: 'Bearing 6205',
    category: 'Mechanical',
    quantity: 15,
    minStock: 5,
    unitCost: 450,
    location: 'Warehouse A',
  },
  {
    partNumber: 'PT-002',
    name: 'V-Belt B48',
    category: 'Mechanical',
    quantity: 8,
    minStock: 10,
    unitCost: 320,
    location: 'Warehouse A',
  },
  {
    partNumber: 'PT-003',
    name: 'Oil Seal 40×60',
    category: 'Mechanical',
    quantity: 20,
    minStock: 8,
    unitCost: 180,
    location: 'Warehouse B',
  },
  {
    partNumber: 'PT-004',
    name: 'Contactor LC1D25',
    category: 'Electrical',
    quantity: 4,
    minStock: 5,
    unitCost: 2800,
    location: 'Warehouse B',
  },
  {
    partNumber: 'PT-005',
    name: 'Fuse 32A',
    category: 'Electrical',
    quantity: 50,
    minStock: 20,
    unitCost: 85,
    location: 'Warehouse C',
  },
  {
    partNumber: 'PT-006',
    name: 'Air Filter Cartridge',
    category: 'Consumable',
    quantity: 12,
    minStock: 6,
    unitCost: 1200,
    location: 'Warehouse A',
  },
  {
    partNumber: 'PT-007',
    name: 'Hydraulic Pump Gear Set',
    category: 'Mechanical',
    quantity: 2,
    minStock: 3,
    unitCost: 18500,
    location: 'Warehouse B',
  },
  {
    partNumber: 'PT-008',
    name: 'Pressure Gauge 0-10bar',
    category: 'Electrical',
    quantity: 8,
    minStock: 4,
    unitCost: 680,
    location: 'Warehouse C',
  },
  {
    partNumber: 'PT-009',
    name: 'Grease Cartridge 400g',
    category: 'Consumable',
    quantity: 30,
    minStock: 12,
    unitCost: 220,
    location: 'Warehouse A',
  },
  {
    partNumber: 'PT-010',
    name: 'Motor 3kW 4P',
    category: 'Electrical',
    quantity: 4,
    minStock: 2,
    unitCost: 38500,
    location: 'Warehouse B',
  },
]

const CAT_COLOR: Record<Category, string> = {
  Mechanical: 'bg-blue-100 text-blue-800',
  Electrical: 'bg-yellow-100 text-yellow-800',
  Consumable: 'bg-green-100 text-green-800',
}
const CATS = ['All', 'Mechanical', 'Electrical', 'Consumable'] as const

export default function InventoryPage() {
  const [parts, setParts] = useState(SEED)
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [adj, setAdj] = useState<Part | null>(null)
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState('')

  const low = parts.filter((p) => p.quantity <= p.minStock).length
  const total = parts.reduce((s, p) => s + p.quantity * p.unitCost, 0)
  const rows = parts
    .filter((p) => cat === 'All' || p.category === cat)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.partNumber.toLowerCase().includes(search.toLowerCase()),
    )

  const apply = () => {
    if (!adj || !reason || delta === 0) return
    setParts((prev) =>
      prev.map((p) =>
        p.partNumber === adj.partNumber ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p,
      ),
    )
    setAdj(null)
    setDelta(0)
    setReason('')
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b bg-background px-6 py-4 shrink-0 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">คลังอะไหล่</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          เพิ่มอะไหล่
        </Button>
      </div>

      <div className="p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { label: 'SKU ทั้งหมด', val: '10', red: false },
              { label: 'สต็อกต่ำ', val: String(low), red: true },
              { label: 'มูลค่ารวม', val: `฿${total.toLocaleString()}`, red: false },
            ] as const
          ).map(({ label, val, red }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('mt-1 text-2xl font-bold', red && low > 0 && 'text-red-600')}>
                {val}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                cat === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {c}
            </button>
          ))}
          <Input
            placeholder="ค้นหาชื่อ / รหัสอะไหล่…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 text-sm ml-auto"
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {['รหัส', 'ชื่อ', 'หมวดหมู่', 'จำนวน', 'ขั้นต่ำ', 'ราคาต่อชิ้น', 'ตำแหน่ง', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.partNumber}
                  className={cn(
                    'border-b last:border-0',
                    p.quantity <= p.minStock ? 'bg-amber-50' : 'hover:bg-muted/20',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs">{p.partNumber}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-medium',
                        CAT_COLOR[p.category],
                      )}
                    >
                      {p.category}
                    </span>
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 font-semibold',
                      p.quantity <= p.minStock && 'text-red-600',
                    )}
                  >
                    {p.quantity}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.minStock}</td>
                  <td className="px-4 py-3">฿{p.unitCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.location}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAdj(p)
                        setDelta(0)
                      }}
                    >
                      ปรับสต็อก
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Part dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มอะไหล่ใหม่</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">ฟอร์มเพิ่มอะไหล่ — เร็วๆ นี้</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock dialog */}
      <Dialog open={!!adj} onOpenChange={(v) => !v && setAdj(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปรับสต็อก — {adj?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setDelta((d) => d - 1)}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
                className="w-24 text-center"
              />
              <Button variant="outline" size="icon" onClick={() => setDelta((d) => d + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                ปัจจุบัน: {adj?.quantity} → {Math.max(0, (adj?.quantity ?? 0) + delta)}
              </span>
            </div>
            <Input
              placeholder="เหตุผล (เช่น ใช้ใน WO-003)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdj(null)}>
              ยกเลิก
            </Button>
            <Button onClick={apply} disabled={delta === 0 || !reason}>
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
