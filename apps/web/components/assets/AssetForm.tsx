'use client'

/**
 * AssetForm — create / update form.
 * Used in a slide-over Sheet and on the /assets/new page.
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, addDays, isBefore } from 'date-fns'
import { AlertTriangle, Loader2, Search, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useCategories, useLocations, useAssetTree, useAsset } from '@/hooks/useAssets'
import type {
  AssetDetail,
  CreateAssetPayload,
  UpdateAssetPayload,
  Criticality,
} from '@/lib/api/assets'

// ── Schema ────────────────────────────────────────────────────────────────────

const assetFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  categoryId: z.string().min(1, 'Category is required'),
  criticality: z.enum(['A', 'B', 'C', 'D']),
  installDate: z.string().min(1, 'Install date is required'),
  description: z.string().max(5000).optional(),
  locationId: z.string().optional(),
  parentId: z.string().optional(),
  manufacturer: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  serialNumber: z.string().max(100).optional(),
  warrantyExpiry: z.string().optional(),
  customFields: z.record(z.string()).optional(),
})

type AssetFormValues = z.infer<typeof assetFormSchema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssetFormProps {
  /** Editing existing asset — pre-populates form. */
  asset?: AssetDetail | null
  /** Pre-set parent — used when "Add child" clicked in tree. */
  parentId?: string | undefined
  onSubmit: (values: CreateAssetPayload | UpdateAssetPayload) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetForm({
  asset,
  parentId: initialParentId,
  onSubmit,
  onCancel,
  submitLabel = 'Create Asset',
}: AssetFormProps) {
  const isEdit = !!asset
  const [submitting, setSubmitting] = useState(false)

  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: tree } = useAssetTree()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: asset?.name ?? '',
      categoryId: asset?.categoryId ?? '',
      criticality: (asset?.criticality ?? 'C') as Criticality,
      installDate: asset?.installDate ? asset.installDate.slice(0, 10) : '',
      description: asset?.description ?? '',
      locationId: asset?.locationId ?? '',
      parentId: asset?.parentId ?? initialParentId ?? '',
      manufacturer: asset?.manufacturer ?? '',
      model: asset?.model ?? '',
      serialNumber: asset?.serialNumber ?? '',
      warrantyExpiry: asset?.warrantyExpiry ? asset.warrantyExpiry.slice(0, 10) : '',
    },
  })

  const warrantyExpiry = watch('warrantyExpiry')
  const parentId = watch('parentId')
  const categoryId = watch('categoryId')

  // ── Parent depth check ────────────────────────────────────────────────────

  const parentNode = parentId ? tree?.flat.find((n) => n.id === parentId) : null
  const parentDepth = parentNode?.depth ?? -1
  const wouldExceed = parentDepth >= 4 // depth 0-4 = 5 levels max

  // ── Warranty warning ──────────────────────────────────────────────────────

  const warrantyDate = warrantyExpiry ? new Date(warrantyExpiry) : null
  const warnWarranty = warrantyDate !== null && isBefore(warrantyDate, addDays(new Date(), 90))

  // ── Submit ────────────────────────────────────────────────────────────────

  async function submit(values: AssetFormValues) {
    if (wouldExceed) return
    setSubmitting(true)
    try {
      const base = {
        name: values.name,
        description: values.description || undefined,
        manufacturer: values.manufacturer || undefined,
        model: values.model || undefined,
        serialNumber: values.serialNumber || undefined,
        warrantyExpiry: values.warrantyExpiry
          ? `${values.warrantyExpiry}T00:00:00.000Z`
          : undefined,
      }

      if (isEdit) {
        await onSubmit(base as UpdateAssetPayload)
      } else {
        await onSubmit({
          ...base,
          categoryId: values.categoryId,
          criticality: values.criticality,
          installDate: `${values.installDate}T00:00:00.000Z`,
          locationId: values.locationId || undefined,
          parentId: values.parentId || undefined,
        } as CreateAssetPayload)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" placeholder="e.g. Centrifugal Pump P-101" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Category + Criticality (row) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <Select value={watch('categoryId')} onValueChange={(v) => setValue('categoryId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p className="text-xs text-destructive">{errors.categoryId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Criticality *</Label>
          <Select
            value={watch('criticality')}
            onValueChange={(v) => setValue('criticality', v as Criticality)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />A — Mission-critical
                </span>
              </SelectItem>
              <SelectItem value="B">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />B — High-impact
                </span>
              </SelectItem>
              <SelectItem value="C">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />C — Moderate
                </span>
              </SelectItem>
              <SelectItem value="D">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />D — Low-impact
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Install Date */}
      {!isEdit && (
        <div className="space-y-1.5">
          <Label htmlFor="installDate">Install Date *</Label>
          <Input id="installDate" type="date" {...register('installDate')} />
          {errors.installDate && (
            <p className="text-xs text-destructive">{errors.installDate.message}</p>
          )}
        </div>
      )}

      {/* Location */}
      <div className="space-y-1.5">
        <Label>Location</Label>
        <Select
          value={watch('locationId') ?? 'none'}
          onValueChange={(v) => setValue('locationId', v === 'none' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select location (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} ({l.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Parent Asset */}
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>Parent Asset</Label>
          <Select
            value={watch('parentId') ?? 'none'}
            onValueChange={(v) => setValue('parentId', v === 'none' ? '' : v)}
          >
            <SelectTrigger className={wouldExceed ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select parent (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Root (no parent) —</SelectItem>
              {(tree?.flat ?? [])
                .filter((n) => n.depth < 4)
                .map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span
                      style={{ paddingLeft: `${n.depth * 12}px` }}
                      className="flex items-center gap-1"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {n.assetNumber}
                      </span>
                      {n.name}
                      <Badge variant="outline" className="ml-1 text-[9px] h-3">
                        Depth {n.depth + 1}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {wouldExceed && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Cannot add child — parent is already at maximum depth (5)
            </p>
          )}
        </div>
      )}

      {/* Manufacturer + Model (row) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="manufacturer">Manufacturer</Label>
          <Input id="manufacturer" placeholder="e.g. Grundfos" {...register('manufacturer')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="model">Model</Label>
          <Input id="model" placeholder="e.g. CR 10-4" {...register('model')} />
        </div>
      </div>

      {/* Serial Number */}
      <div className="space-y-1.5">
        <Label htmlFor="serialNumber">Serial Number</Label>
        <Input id="serialNumber" placeholder="e.g. SN-12345" {...register('serialNumber')} />
      </div>

      {/* Warranty Expiry */}
      <div className="space-y-1.5">
        <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
        <Input id="warrantyExpiry" type="date" {...register('warrantyExpiry')} />
        {warnWarranty && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Warranty expires within 90 days
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="Optional description..."
          {...register('description')}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting || wouldExceed}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
