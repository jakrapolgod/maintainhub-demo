'use client'

/**
 * BulkImportWizard — four-step dialog for importing assets from CSV / XLSX.
 *
 * Step 1  Upload   — drag-and-drop + template download
 * Step 2  Preview  — parsed rows table with inline validation errors
 * Step 3  Importing — progress bar + running success/fail counts
 * Step 4  Results  — summary card + downloadable error CSV
 */
import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useCategories, useLocations } from '@/hooks/useAssets'
import type { AssetCategory, LocationStub } from '@/lib/api/assets'

// ── Template columns ──────────────────────────────────────────────────────────

const TEMPLATE_COLUMNS = [
  'name',
  'categoryCode',
  'criticality',
  'status',
  'locationCode',
  'parentAssetNumber',
  'manufacturer',
  'model',
  'serialNumber',
  'installDate',
  'warrantyExpiry',
  'description',
] as const

type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number]

// ── Row types ─────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number
  raw: Record<string, string>
  name: string
  categoryCode: string
  criticality: string
  status: string
  locationCode: string
  parentAssetNumber: string
  manufacturer: string
  model: string
  serialNumber: string
  installDate: string
  warrantyExpiry: string
  description: string
  errors: string[]
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BulkImportWizardProps {
  open: boolean
  onClose: () => void
  onComplete?: () => void
}

// ── Template generator ────────────────────────────────────────────────────────

function generateTemplate(categories: AssetCategory[], locations: LocationStub[]): void {
  const wb = XLSX.utils.book_new()

  // ── Assets sheet (with header + sample row) ────────────────────────────────
  const headers = [
    'name*',
    'categoryCode*',
    'criticality',
    'status',
    'locationCode',
    'parentAssetNumber',
    'manufacturer',
    'model',
    'serialNumber',
    'installDate',
    'warrantyExpiry',
    'description',
  ]
  const sample = [
    'Centrifugal Pump P-101',
    categories[0]?.code ?? 'PUMP',
    'B',
    'OPERATIONAL',
    locations[0]?.code ?? 'BLDG-A',
    '',
    'Grundfos',
    'CR 10-4',
    'SN-12345',
    '2023-01-15',
    '2026-01-15',
    'Main process pump',
  ]
  const assetsSheet = XLSX.utils.aoa_to_sheet([headers, sample])
  XLSX.utils.book_append_sheet(wb, assetsSheet, 'Assets')

  // ── Categories reference sheet ─────────────────────────────────────────────
  const catData = [['code', 'name'], ...categories.map((c) => [c.code, c.name])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catData), 'Categories')

  // ── Locations reference sheet ──────────────────────────────────────────────
  const locData = [['code', 'name'], ...locations.map((l) => [l.code, l.name])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(locData), 'Locations')

  // Download
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'asset_import_template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Row parser ────────────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, TemplateColumn> = {
  name: 'name',
  categorycode: 'categoryCode',
  category: 'categoryCode',
  criticality: 'criticality',
  status: 'status',
  locationcode: 'locationCode',
  location: 'locationCode',
  parentassetnumber: 'parentAssetNumber',
  parent: 'parentAssetNumber',
  manufacturer: 'manufacturer',
  model: 'model',
  serialnumber: 'serialNumber',
  serial: 'serialNumber',
  installdate: 'installDate',
  warrantyexpiry: 'warrantyExpiry',
  warranty: 'warrantyExpiry',
  description: 'description',
}

function parseFile(buf: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!ws) return []

  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
    raw: false,
    dateNF: 'YYYY-MM-DD',
  })

  if (raw.length === 0) return []

  // Build column alias map from first row's keys
  const firstRow = raw[0] ?? {}
  const keyMap = new Map<string, TemplateColumn>()
  for (const key of Object.keys(firstRow)) {
    const alias = COLUMN_ALIASES[key.toLowerCase().replace(/[^a-z0-9]/g, '')]
    if (alias) keyMap.set(key, alias)
  }

  return raw.map((row, idx) => {
    const mapped: Record<string, string> = {}
    for (const [srcKey, targetKey] of keyMap) {
      mapped[targetKey] = (row[srcKey] ?? '').trim()
    }

    return {
      rowIndex: idx + 2, // 1-based, +1 for header row
      raw: row,
      name: mapped['name'] ?? '',
      categoryCode: mapped['categoryCode'] ?? '',
      criticality: mapped['criticality'] ?? 'C',
      status: mapped['status'] ?? 'OPERATIONAL',
      locationCode: mapped['locationCode'] ?? '',
      parentAssetNumber: mapped['parentAssetNumber'] ?? '',
      manufacturer: mapped['manufacturer'] ?? '',
      model: mapped['model'] ?? '',
      serialNumber: mapped['serialNumber'] ?? '',
      installDate: mapped['installDate'] ?? '',
      warrantyExpiry: mapped['warrantyExpiry'] ?? '',
      description: mapped['description'] ?? '',
      errors: [],
    }
  })
}

// ── Client-side validation ────────────────────────────────────────────────────

function validateRows(
  rows: ParsedRow[],
  categories: AssetCategory[],
  locations: LocationStub[],
): ParsedRow[] {
  const catCodes = new Set(categories.map((c) => c.code.toUpperCase()))
  const locCodes = new Set(locations.map((l) => l.code.toUpperCase()))
  const seenSerials = new Set<string>()
  const VALID_CRITICALITY = new Set(['A', 'B', 'C', 'D'])
  const VALID_STATUS = new Set(['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE'])

  return rows.map((row) => {
    const errors: string[] = []

    if (!row.name) errors.push('Name is required')
    if (!row.categoryCode) errors.push('Category code is required')
    else if (!catCodes.has(row.categoryCode.toUpperCase()))
      errors.push(`Unknown category "${row.categoryCode}"`)

    if (row.criticality && !VALID_CRITICALITY.has(row.criticality.toUpperCase())) {
      errors.push(`Invalid criticality "${row.criticality}" — must be A, B, C, or D`)
    }
    if (row.status && !VALID_STATUS.has(row.status.toUpperCase())) {
      errors.push(`Invalid status "${row.status}"`)
    }
    if (row.locationCode && !locCodes.has(row.locationCode.toUpperCase())) {
      errors.push(`Unknown location "${row.locationCode}"`)
    }
    if (row.installDate && Number.isNaN(Date.parse(row.installDate))) {
      errors.push(`Invalid installDate "${row.installDate}"`)
    }
    if (row.warrantyExpiry && Number.isNaN(Date.parse(row.warrantyExpiry))) {
      errors.push(`Invalid warrantyExpiry "${row.warrantyExpiry}"`)
    }
    if (row.serialNumber) {
      if (seenSerials.has(row.serialNumber)) {
        errors.push(`Duplicate serialNumber "${row.serialNumber}"`)
      } else {
        seenSerials.add(row.serialNumber)
      }
    }

    return { ...row, errors }
  })
}

// ── Error CSV generator ────────────────────────────────────────────────────────

function downloadErrorReport(
  failed: { rowIndex: number; assetNumber?: string; reason: string }[],
): void {
  const headers = ['row', 'assetNumber', 'reason']
  const data = failed.map((f) => [f.rowIndex, f.assetNumber ?? '', f.reason])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Errors')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'asset_import_errors.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'importing' | 'results'

interface ImportResult {
  success: number
  failed: { rowIndex: number; assetNumber?: string; reason: string }[]
}

export function BulkImportWizard({ open, onClose, onComplete }: BulkImportWizardProps) {
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [progress, setProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<ArrayBuffer | null>(null)

  // ── Reset ─────────────────────────────────────────────────────────────────

  function reset() {
    setStep('upload')
    setFileName(null)
    setRows([])
    setProgress(0)
    setImportResult(null)
    fileRef.current = null
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Step 1: file drop ─────────────────────────────────────────────────────

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0]
      if (!file) return
      setFileName(file.name)

      const reader = new FileReader()
      reader.onload = (e) => {
        const buf = e.target?.result as ArrayBuffer
        fileRef.current = buf
        const parsed = parseFile(buf)
        const validated = validateRows(parsed, categories, locations)
        setRows(validated)
        setStep('preview')
      }
      reader.readAsArrayBuffer(file)
    },
    [categories, locations],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  // ── Step 3: run import ────────────────────────────────────────────────────

  async function runImport() {
    setStep('importing')
    setProgress(0)

    const validRows = rows.filter((r) => r.errors.length === 0)
    const BATCH = 50

    let successTotal = 0
    const failedAll: ImportResult['failed'] = []

    // Collect pre-validation failures (rows with client-side errors)
    rows
      .filter((r) => r.errors.length > 0)
      .forEach((r) =>
        failedAll.push({ rowIndex: r.rowIndex, reason: r.errors[0] ?? 'Validation error' }),
      )

    // Build multipart payload (send as CSV to the API)
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'name',
        'categoryCode',
        'criticality',
        'status',
        'locationCode',
        'parentAssetNumber',
        'manufacturer',
        'model',
        'serialNumber',
        'installDate',
        'warrantyExpiry',
        'description',
      ],
      ...validRows.map((r) => [
        r.name,
        r.categoryCode,
        r.criticality,
        r.status,
        r.locationCode,
        r.parentAssetNumber,
        r.manufacturer,
        r.model,
        r.serialNumber,
        r.installDate,
        r.warrantyExpiry,
        r.description,
      ]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assets')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const form = new FormData()
    form.append('file', new File([blob], 'import.xlsx'))

    const token = typeof window !== 'undefined' ? sessionStorage.getItem('mh_access_token') : null
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'

    // Animate progress while waiting
    const interval = window.setInterval(() => {
      setProgress((p) => Math.min(p + 3, 90))
    }, 200)

    try {
      const res = await fetch(`${BASE}/assets/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const result = (await res.json()) as {
        success: number
        failed: { rowIndex: number; reason: string }[]
      }
      successTotal = result.success
      result.failed.forEach((f) => failedAll.push(f))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      validRows.forEach((r) => failedAll.push({ rowIndex: r.rowIndex, reason: msg }))
    } finally {
      clearInterval(interval)
    }

    setProgress(100)
    setImportResult({ success: successTotal, failed: failedAll })

    setTimeout(() => {
      setStep('results')
      if (successTotal > 0) onComplete?.()
    }, 400)
  }

  const errorCount = rows.filter((r) => r.errors.length > 0).length
  const validCount = rows.length - errorCount

  // ── Render ─────────────────────────────────────────────────────────────────

  const STEP_LABELS: Record<Step, string> = {
    upload: 'Upload File',
    preview: 'Preview & Validate',
    importing: 'Importing…',
    results: 'Results',
  }
  const STEPS: Step[] = ['upload', 'preview', 'importing', 'results']
  const stepIndex = STEPS.indexOf(step)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Import Assets
          </DialogTitle>
          <DialogDescription>
            Import assets from a CSV or XLSX file — up to 5,000 rows per upload.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < stepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i === stepIndex
                      ? 'bg-primary/20 text-primary border border-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={
                  i === stepIndex
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hidden sm:inline'
                }
              >
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="flex-1 overflow-auto space-y-4 py-2">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/30'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Drop your CSV or XLSX file here</p>
              <p className="text-sm text-muted-foreground mt-1">or click to browse (max 10 MB)</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Need a template?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Download a pre-filled XLSX with valid category and location codes.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateTemplate(categories, locations)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download Template
              </Button>
            </div>

            <div className="rounded-lg border px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Required columns</p>
              <p>
                <span className="font-mono bg-muted px-1 rounded">name</span>,{' '}
                <span className="font-mono bg-muted px-1 rounded">categoryCode</span>
              </p>
              <p className="text-muted-foreground">
                Optional: criticality (A/B/C/D), status, locationCode, parentAssetNumber,
                manufacturer, model, serialNumber, installDate (YYYY-MM-DD), warrantyExpiry,
                description
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ────────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden space-y-3 py-2">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{fileName}</span>
                <Badge variant="outline">{rows.length} rows</Badge>
                {errorCount > 0 ? (
                  <Badge variant="destructive">{errorCount} errors</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    {validCount} valid
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                New file
              </Button>
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto rounded-lg border text-xs">
              <table className="w-full min-w-max">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Category</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Criticality</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Location</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Serial</th>
                    <th className="px-3 py-2 text-left text-muted-foreground w-48">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={`border-t ${row.errors.length > 0 ? 'bg-destructive/5' : ''}`}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{row.rowIndex}</td>
                      <td className={`px-3 py-2 ${!row.name ? 'text-destructive' : ''}`}>
                        {row.name || '—'}
                      </td>
                      <td
                        className={`px-3 py-2 ${row.errors.some((e) => e.includes('category')) ? 'text-destructive' : ''}`}
                      >
                        {row.categoryCode || '—'}
                      </td>
                      <td className="px-3 py-2">{row.criticality || '—'}</td>
                      <td
                        className={`px-3 py-2 ${row.errors.some((e) => e.includes('location')) ? 'text-destructive' : ''}`}
                      >
                        {row.locationCode || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.serialNumber || '—'}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="text-destructive flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>
                              {row.errors[0]}
                              {row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-emerald-600">✓ Valid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorCount > 0 && (
              <p className="text-xs text-muted-foreground shrink-0">
                {errorCount} row{errorCount > 1 ? 's' : ''} with errors will be skipped.
                {validCount > 0
                  ? ` ${validCount} valid row${validCount > 1 ? 's' : ''} will be imported.`
                  : ' Fix errors before importing.'}
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Importing ──────────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing assets…
                </span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
              <p className="text-xs text-center text-muted-foreground">
                Processing {validCount} row{validCount !== 1 ? 's' : ''}…
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Results ────────────────────────────────────────────── */}
        {step === 'results' && importResult && (
          <div className="flex-1 flex flex-col gap-4 py-2">
            <div
              className={`rounded-xl border-2 p-6 text-center ${
                importResult.failed.length === 0
                  ? 'border-emerald-200 bg-emerald-50'
                  : importResult.success > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-destructive/20 bg-destructive/5'
              }`}
            >
              {importResult.failed.length === 0 ? (
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
              ) : importResult.success > 0 ? (
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto mb-3 text-destructive" />
              )}

              <h3 className="text-lg font-bold">
                {importResult.failed.length === 0
                  ? 'Import Successful!'
                  : importResult.success > 0
                    ? 'Partially Imported'
                    : 'Import Failed'}
              </h3>

              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{importResult.success}</p>
                  <p className="text-muted-foreground">Imported</p>
                </div>
                {importResult.failed.length > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-destructive">
                      {importResult.failed.length}
                    </p>
                    <p className="text-muted-foreground">Failed</p>
                  </div>
                )}
              </div>
            </div>

            {importResult.failed.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Failed rows</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadErrorReport(importResult.failed)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download Error Report
                  </Button>
                </div>
                <div className="max-h-40 overflow-auto rounded-lg border text-xs">
                  {importResult.failed.slice(0, 20).map((f, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 border-b last:border-0 px-3 py-2"
                    >
                      <span className="text-muted-foreground w-10 shrink-0">Row {f.rowIndex}</span>
                      <span className="text-destructive">{f.reason}</span>
                    </div>
                  ))}
                  {importResult.failed.length > 20 && (
                    <p className="px-3 py-2 text-muted-foreground">
                      + {importResult.failed.length - 20} more — download the error report
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0">
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button disabled={validCount === 0} onClick={() => void runImport()}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Import {validCount} Row{validCount !== 1 ? 's' : ''}
              </Button>
            </>
          )}

          {step === 'results' && (
            <>
              <Button variant="outline" onClick={reset}>
                Import More
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
