/**
 * ExcelCsvParser — Typed Excel/CSV import with worker_threads streaming.
 *
 * ## Supported formats
 *   .xlsx, .xls, .ods  — parsed via SheetJS (xlsx)
 *   .csv               — parsed via SheetJS (handles quoting, BOM, CRLF)
 *
 * ## Large-file strategy
 *   Files ≤ INLINE_ROW_LIMIT rows are parsed synchronously on the main thread.
 *   Files > INLINE_ROW_LIMIT are offloaded to a `worker_threads` Worker so
 *   the Fastify event loop is never blocked during sheet traversal.
 *
 * ## Column mapping
 *   `parseFile()` accepts a `columnMap` that maps spreadsheet column headers
 *   to typed output field names, with optional transformers.
 *
 * ## Usage
 *   const parser = new ExcelCsvParser()
 *   const result = await parser.parseFile(buffer, '.xlsx', {
 *     columnMap: {
 *       'Asset Name':    { field: 'name',     required: true  },
 *       'Install Date':  { field: 'installDate', transform: (v) => new Date(v) },
 *     },
 *     sheetName: 'Assets',   // optional — defaults to first sheet
 *   })
 *   // result.rows: Array<Record<string, unknown>>
 *   // result.errors: Array<{ row: number, message: string }>
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import * as XLSX from 'xlsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Parse synchronously on the main thread when row count is below this. */
const INLINE_ROW_LIMIT = 1_000

/** Maximum columns read per row (guards against pathological wide sheets). */
const MAX_COLUMNS = 200

// ── Types ──────────────────────────────────────────────────────────────────────

export type CellValue = string | number | boolean | Date | null | undefined

export interface ColumnMapping {
  /** Target field name in the output record. */
  field: string
  /** When true, rows missing this column value produce a parse error. */
  required?: boolean
  /**
   * Optional value transformer.
   * Receives the raw string cell value; returns the typed output value.
   * Returning `null` means "omit this field from the row".
   */
  transform?: (raw: string) => CellValue
}

export interface ParseOptions {
  /** Maps spreadsheet header → ColumnMapping. Header match is case-insensitive. */
  columnMap: Record<string, ColumnMapping>
  /** Name of the sheet to parse. Defaults to the first sheet. */
  sheetName?: string
  /** 1-based row index of the header row. Defaults to 1. */
  headerRow?: number
}

export interface ParsedRow {
  /** 1-based row number in the original spreadsheet (1 = header row). */
  rowIndex: number
  data: Record<string, CellValue>
}

export interface ParseResult {
  rows: ParsedRow[]
  totalRows: number
  skippedRows: number
  errors: Array<{ rowIndex: number; message: string }>
  sheetName: string
}

// ── Worker thread entry point ─────────────────────────────────────────────────
// When this module is executed inside a worker_threads Worker, `isMainThread`
// is false and we run the parse task directly, posting results back.

if (!isMainThread && parentPort !== null) {
  const { bufferData, mimeType, opts } = workerData as {
    bufferData: Buffer
    mimeType: string
    opts: ParseOptions
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const result = parseSync(Buffer.from(bufferData), mimeType, opts)
    parentPort.postMessage({ ok: true, result })
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// ── Synchronous parser (used directly or from worker) ─────────────────────────

function parseSync(buf: Buffer, mimeType: string, opts: ParseOptions): ParseResult {
  const isCSV = mimeType === 'text/csv' || mimeType.endsWith('.csv')
  const book = isCSV
    ? XLSX.read(buf, { type: 'buffer', raw: false, codepage: 65001 })
    : XLSX.read(buf, { type: 'buffer', cellDates: true })

  const sheetName = opts.sheetName ?? book.SheetNames[0]
  if (!sheetName || !book.Sheets[sheetName]) {
    throw new Error(`Sheet "${opts.sheetName ?? 'first sheet'}" not found in workbook`)
  }

  const sheet = book.Sheets[sheetName]!
  const headerRow = (opts.headerRow ?? 1) - 1 // convert to 0-based

  // Convert to array-of-arrays
  const rawRows: string[][] = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (rawRows.length === 0) {
    return { rows: [], totalRows: 0, skippedRows: 0, errors: [], sheetName }
  }

  // ── Resolve header → column index mapping ──────────────────────────────────
  const headers = (rawRows[headerRow] ?? []).slice(0, MAX_COLUMNS).map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase(),
  )

  // Build a map: normalised header → ColumnMapping
  const colIndex = new Map<string, { idx: number; mapping: ColumnMapping }>()
  for (const [rawHeader, mapping] of Object.entries(opts.columnMap)) {
    const normalised = rawHeader.trim().toLowerCase()
    const idx = headers.indexOf(normalised)
    if (idx !== -1) {
      colIndex.set(normalised, { idx, mapping })
    }
  }

  // Validate required columns are present in the sheet
  const missingRequired: string[] = []
  for (const [rawHeader, mapping] of Object.entries(opts.columnMap)) {
    if (mapping.required) {
      const normalised = rawHeader.trim().toLowerCase()
      if (!colIndex.has(normalised)) {
        missingRequired.push(rawHeader)
      }
    }
  }
  if (missingRequired.length > 0) {
    throw new Error(`Missing required columns: ${missingRequired.join(', ')}`)
  }

  // ── Parse data rows ────────────────────────────────────────────────────────
  const rows: ParsedRow[] = []
  const errors: Array<{ rowIndex: number; message: string }> = []
  let skipped = 0

  for (let r = headerRow + 1; r < rawRows.length; r += 1) {
    const rawRow = rawRows[r] ?? []
    const rowData: Record<string, CellValue> = {}
    let hasAnyValue = false
    const rowErrors: string[] = []

    for (const [, { idx, mapping }] of colIndex) {
      const raw = String(rawRow[idx] ?? '').trim()

      if (raw === '') {
        if (mapping.required) {
          rowErrors.push(`Required field "${mapping.field}" is empty`)
        }
        rowData[mapping.field] = null
      } else {
        hasAnyValue = true
        if (mapping.transform !== undefined) {
          try {
            rowData[mapping.field] = mapping.transform(raw)
          } catch (err) {
            rowErrors.push(
              `Field "${mapping.field}": ${err instanceof Error ? err.message : String(err)}`,
            )
            rowData[mapping.field] = raw
          }
        } else {
          rowData[mapping.field] = raw
        }
      }
    }

    // Skip entirely empty rows silently
    if (!hasAnyValue) {
      skipped += 1
    } else if (rowErrors.length > 0) {
      for (const msg of rowErrors) {
        errors.push({ rowIndex: r + 1, message: msg })
      }
      // Still include the row so callers can report all errors at once
      rows.push({ rowIndex: r + 1, data: rowData })
    } else {
      rows.push({ rowIndex: r + 1, data: rowData })
    }
  }

  return {
    rows,
    totalRows: rawRows.length - 1 - headerRow,
    skippedRows: skipped,
    errors,
    sheetName,
  }
}

// ── Main parser class ─────────────────────────────────────────────────────────

export class ExcelCsvParser {
  /**
   * Parse a spreadsheet or CSV buffer.
   *
   * Files with > INLINE_ROW_LIMIT rows are offloaded to a worker thread to
   * avoid blocking the event loop.
   *
   * @param buf       Raw file bytes.
   * @param mimeType  e.g. 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or 'text/csv'
   * @param opts      Column mapping and options.
   */
  async parseFile(buf: Buffer, mimeType: string, opts: ParseOptions): Promise<ParseResult> {
    // Quick peek at the row count to decide whether to offload
    const useWorker = await ExcelCsvParser.shouldUseWorker(buf, mimeType)

    if (!useWorker) {
      return parseSync(buf, mimeType, opts)
    }

    return this.parseInWorker(buf, mimeType, opts)
  }

  /**
   * Validate that a buffer has the required columns before full parsing.
   * Fast check — only reads the header row.
   */
  // eslint-disable-next-line class-methods-use-this
  validateColumns(
    buf: Buffer,
    mimeType: string,
    required: string[],
    sheetName?: string,
  ): { valid: boolean; missing: string[] } {
    const isCSV = mimeType === 'text/csv' || mimeType.endsWith('.csv')
    const book = isCSV
      ? XLSX.read(buf, { type: 'buffer', sheetRows: 1 })
      : XLSX.read(buf, { type: 'buffer', sheetRows: 1 })

    const name = sheetName ?? book.SheetNames[0]
    if (!name || !book.Sheets[name]) {
      return { valid: false, missing: required }
    }

    const headers =
      XLSX.utils
        .sheet_to_json<string[]>(book.Sheets[name]!, {
          header: 1,
          defval: '',
          raw: false,
        })[0]
        ?.map((h) => String(h).trim().toLowerCase()) ?? []

    const missing = required.filter((col) => !headers.includes(col.trim().toLowerCase()))
    return { valid: missing.length === 0, missing }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async shouldUseWorker(buf: Buffer, mimeType: string): Promise<boolean> {
    try {
      const isCSV = mimeType === 'text/csv' || mimeType.endsWith('.csv')
      const book = isCSV
        ? XLSX.read(buf, { type: 'buffer', sheetRows: INLINE_ROW_LIMIT + 1 })
        : XLSX.read(buf, { type: 'buffer', sheetRows: INLINE_ROW_LIMIT + 1 })

      const sheet = book.Sheets[book.SheetNames[0]!]
      if (!sheet) return false

      const ref = sheet['!ref']
      if (!ref) return false

      const range = XLSX.utils.decode_range(ref)
      return range.e.r - range.s.r > INLINE_ROW_LIMIT
    } catch {
      return false
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private parseInWorker(buf: Buffer, mimeType: string, opts: ParseOptions): Promise<ParseResult> {
    return new Promise<ParseResult>((resolve, reject) => {
      const worker = new Worker(
        // Re-execute this compiled module file inside the worker thread.
        // __filename is the CJS-global path to the current file; it is
        // available because `apps/api` uses `module: "NodeNext"` without
        // `"type":"module"`, so all .ts files compile to CommonJS.
        __filename,
        {
          workerData: {
            bufferData: buf,
            mimeType,
            opts,
          },
        },
      )

      worker.once('message', (msg: { ok: boolean; result?: ParseResult; error?: string }) => {
        if (msg.ok && msg.result !== undefined) {
          resolve(msg.result)
        } else {
          reject(new Error(msg.error ?? 'Worker parsing failed'))
        }
        void worker.terminate()
      })

      worker.once('error', (err) => {
        reject(err)
        void worker.terminate()
      })
    })
  }
}
