/**
 * Asset bulk import / export routes.
 *
 * POST /import — multipart CSV or XLSX → BulkImportAssetsHandler
 * GET  /export — current filter → XLSX / CSV download
 *
 * ## Import format
 * CSV or XLSX with a header row. Column names (case-insensitive):
 *   name, categoryCode, criticality, status, locationCode,
 *   parentAssetNumber, description, manufacturer, model,
 *   serialNumber, installDate (YYYY-MM-DD), warrantyExpiry (YYYY-MM-DD),
 *   customFields (JSON string)
 *
 * ## Export
 * Returns all assets matching the query filters as an XLSX workbook.
 * Large exports (>5000 rows) are truncated with a warning header.
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import * as XLSX from 'xlsx'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import { BulkImportAssetsHandler } from '../../../application/assets/commands/index.js'
import type { BulkImportRow } from '../../../application/assets/commands/index.js'
import { invalidateAssetTreeCache, buildCmdCtx, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const EXPORT_ROW_LIMIT = 5_000

const IMPORT_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

// ── CSV column map ─────────────────────────────────────────────────────────────

/**
 * Maps canonical column names (lowercase, no spaces) to `BulkImportRow` fields.
 * Accepts common variations (e.g. `assetname`, `asset name`, `assetNumber`).
 */
const COLUMN_ALIASES: Record<string, keyof BulkImportRow> = {
  name: 'name',
  assetname: 'name',
  categorycode: 'categoryCode',
  category: 'categoryCode',
  criticality: 'criticality',
  status: 'status',
  locationcode: 'locationCode',
  location: 'locationCode',
  parentassetnumber: 'parentAssetNumber',
  parent: 'parentAssetNumber',
  description: 'description',
  manufacturer: 'manufacturer',
  model: 'model',
  serialnumber: 'serialNumber',
  serial: 'serialNumber',
  installdate: 'installDate',
  warrantyexpiry: 'warrantyExpiry',
  warranty: 'warrantyExpiry',
  customfields: 'customFields',
}

// ── Shared transform helper ──────────────────────────────────────────────────

function toStringArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined
  if (Array.isArray(v)) return v
  return [v]
}

// ── Query schema (export) ─────────────────────────────────────────────────────

const exportQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(toStringArray),
  criticality: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(toStringArray),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
})

// ── Spreadsheet parser (defined before plugin to satisfy no-use-before-define)

/**
 * Parse a Buffer (CSV or XLSX) into `BulkImportRow[]`.
 * Row indices are 1-based (header = row 0).
 */
function parseSpreadsheet(buf: Buffer, _mime: string): BulkImportRow[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0] ?? '']

  if (!ws) return []

  const raw = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
    dateNF: 'YYYY-MM-DD',
  }) as unknown as string[][]

  if (raw.length < 2) return []

  const headerRow = raw[0] ?? []
  const colMap = new Map<number, keyof BulkImportRow>()
  headerRow.forEach((cell, i) => {
    const key = String(cell)
      .toLowerCase()
      .replace(/[\s_-]/g, '') as keyof typeof COLUMN_ALIASES
    const field = COLUMN_ALIASES[key]
    if (field !== undefined) colMap.set(i, field)
  })

  const rows: BulkImportRow[] = []
  for (let r = 1; r < raw.length; r += 1) {
    const dataRow = raw[r] ?? []
    const row: Partial<BulkImportRow> = { rowIndex: r }
    for (const [colIdx, field] of colMap) {
      const cellVal = String(dataRow[colIdx] ?? '').trim()
      if (cellVal !== '') (row as Record<string, string>)[field] = cellVal
    }
    const hasData = Object.keys(row).some((k) => k !== 'rowIndex')
    if (hasData) rows.push(row as BulkImportRow)
  }
  return rows
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const importExportRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fieldSize: 0 },
  })

  // ── POST /import ───────────────────────────────────────────────────────────
  fastify.post(
    '/import',
    {
      schema: {
        description: [
          'Bulk-import assets from a CSV or XLSX file (max 10 MB).',
          'Returns per-row success/failure counts.',
          'Failed rows include the row index and reason.',
        ].join(' '),
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'integer' },
              failed: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          400: { description: 'No file / invalid format', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          413: { description: 'File exceeds 10 MB', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'create'),
    },
    async (request, reply) => {
      // ── 1. Parse multipart ────────────────────────────────────────────────
      let filePart
      try {
        filePart = await request.file()
      } catch {
        throw new DomainException('Request must be multipart/form-data', 'INVALID_REQUEST', 400)
      }
      if (!filePart) throw new DomainException('No file uploaded', 'NO_FILE', 400)

      const { mimetype, file: fileStream } = filePart

      const normMime = mimetype.toLowerCase().split(';')[0]!.trim()
      if (!IMPORT_MIME_TYPES.has(normMime)) {
        fileStream.resume()
        throw new DomainException(
          `File type "${mimetype}" not supported. Use CSV or XLSX.`,
          'INVALID_MIME_TYPE',
          400,
        )
      }

      // ── 2. Buffer the file ────────────────────────────────────────────────
      const chunks: Buffer[] = []
      for await (const chunk of fileStream) {
        chunks.push(chunk as Buffer)
      }
      const fileBuffer = Buffer.concat(chunks)

      // ── 3. Parse CSV or XLSX → rows ────────────────────────────────────────
      const rows = parseSpreadsheet(fileBuffer, normMime)

      if (rows.length === 0) {
        return reply.send({
          success: 0,
          failed: [{ rowIndex: 0, reason: 'File is empty or header row only' }],
        })
      }

      // ── 4. Execute bulk import ─────────────────────────────────────────────
      const handler = new BulkImportAssetsHandler(request.db, request.server.prisma, {
        nextAssetNumber: async (tenantId: string) => {
          const { PrismaAssetRepository } = await import('../../../infrastructure/assets/index.js')
          const repo = new PrismaAssetRepository(request.server.prisma, request.server.redis)
          return repo.nextAssetNumber(tenantId)
        },
      } as never)

      const result = await handler.handle({ rows }, buildCmdCtx(request))
      await invalidateAssetTreeCache(request.server.redis, request.user.tid)

      return reply.send(result)
    },
  )

  // ── GET /export ────────────────────────────────────────────────────────────
  fastify.get(
    '/export',
    {
      schema: {
        description: [
          'Export assets matching filters as an XLSX or CSV file.',
          `Rows are capped at ${EXPORT_ROW_LIMIT}. Add filters to narrow results.`,
        ].join(' '),
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            categoryId: { type: 'string' },
            locationId: { type: 'string' },
            status: { type: 'array', items: { type: 'string' } },
            criticality: { type: 'array', items: { type: 'string' } },
            format: { type: 'string', enum: ['xlsx', 'csv'], default: 'xlsx' },
          },
        },
        response: {
          200: { type: 'string', format: 'binary' },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const q = exportQuerySchema.parse(request.query)

      const where: Record<string, unknown> = {
        deletedAt: null,
        ...(q.search !== undefined && {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { assetNumber: { contains: q.search, mode: 'insensitive' } },
            { serialNumber: { contains: q.search, mode: 'insensitive' } },
          ],
        }),
        ...(q.categoryId !== undefined && { categoryId: q.categoryId }),
        ...(q.locationId !== undefined && { locationId: q.locationId }),
        ...(q.status !== undefined && { status: { in: q.status } }),
        ...(q.criticality !== undefined && { criticality: { in: q.criticality } }),
      }

      const rows = await request.db.asset.findMany({
        where,
        take: EXPORT_ROW_LIMIT,
        orderBy: { assetNumber: 'asc' },
        select: {
          assetNumber: true,
          name: true,
          status: true,
          criticality: true,
          serialNumber: true,
          manufacturer: true,
          model: true,
          description: true,
          installDate: true,
          warrantyExpiry: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { code: true, name: true } },
          location: { select: { code: true, name: true } },
          parent: { select: { assetNumber: true } },
        },
      })

      // Build worksheet data
      const sheetData = [
        // Header row
        [
          'assetNumber',
          'name',
          'status',
          'criticality',
          'categoryCode',
          'categoryName',
          'locationCode',
          'locationName',
          'parentAssetNumber',
          'manufacturer',
          'model',
          'serialNumber',
          'description',
          'installDate',
          'warrantyExpiry',
          'createdAt',
        ],
        // Data rows
        ...rows.map((r) => [
          r.assetNumber,
          r.name,
          r.status,
          r.criticality,
          r.category.code,
          r.category.name,
          r.location?.code ?? '',
          r.location?.name ?? '',
          r.parent?.assetNumber ?? '',
          r.manufacturer ?? '',
          r.model ?? '',
          r.serialNumber ?? '',
          r.description ?? '',
          r.installDate?.toISOString().slice(0, 10) ?? '',
          r.warrantyExpiry?.toISOString().slice(0, 10) ?? '',
          r.createdAt.toISOString().slice(0, 10),
        ]),
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      XLSX.utils.book_append_sheet(wb, ws, 'Assets')

      if (q.format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws)
        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="assets.csv"')
          .send(csv)
      }

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="assets.xlsx"')
        .send(buffer)
    },
  )
}

export default importExportRoutes
