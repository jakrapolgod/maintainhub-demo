/**
 * FailureCodeSeeder
 *
 * Seeds the `FailureCode` table with the ISO 14224 taxonomy and optionally
 * imports custom codes from a CSV file.
 *
 * ## Idempotency
 * Uses `upsert` on the `code` unique field — safe to run multiple times.
 * Existing rows are updated with the latest name/category/system/notes.
 *
 * ## CSV format
 * Header row required.  Columns (case-insensitive):
 *   code, name, category, system, notes
 *
 * Example:
 *   code,name,category,system,notes
 *   CUST-001,Custom Failure,Mechanical,Rotating Equipment,Internal custom code
 *
 * ## Usage (CLI script)
 *   npx ts-node --esm apps/api/src/infrastructure/failure-codes/seed-cli.ts
 *
 * ## Usage (programmatic)
 *   const seeder = new FailureCodeSeeder(prisma, console)
 *   await seeder.seedISO14224()
 *   await seeder.importFromCSV('/path/to/codes.csv')
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { PrismaClient } from '@prisma/client'
import { ISO14224_SEED_DATA } from './iso14224-data.js'
import type { ISO14224Code } from './iso14224-data.js'

export interface SeederLogger {
  info(msg: string, data?: object): void
  warn(msg: string, data?: object): void
  error(msg: string, data?: object): void
}

export interface SeedResult {
  upserted: number
  skipped: number
  errors: number
}

export class FailureCodeSeeder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: SeederLogger,
  ) {}

  // ── Seed ISO 14224 built-in data ──────────────────────────────────────────

  async seedISO14224(): Promise<SeedResult> {
    return this.upsertBatch(ISO14224_SEED_DATA)
  }

  // ── Import from CSV ───────────────────────────────────────────────────────

  /**
   * Reads a CSV file and upserts each row into the FailureCode table.
   * Lines starting with `#` are treated as comments and skipped.
   */
  async importFromCSV(filePath: string): Promise<SeedResult> {
    const rows = await FailureCodeSeeder.parseCSV(filePath)
    this.logger.info(`Parsed ${rows.length} rows from ${filePath}`)
    return this.upsertBatch(rows)
  }

  // ── Private: batch upsert ─────────────────────────────────────────────────

  private async upsertBatch(codes: ISO14224Code[]): Promise<SeedResult> {
    let upserted = 0
    let errors = 0

    for (const code of codes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.failureCode.upsert({
          where: { code: code.code },
          create: {
            code: code.code,
            name: code.name,
            category: code.category,
            system: code.system || null,
            notes: code.notes || null,
          },
          update: {
            name: code.name,
            category: code.category,
            system: code.system || null,
            notes: code.notes || null,
          },
        })
        upserted += 1
      } catch (err) {
        errors += 1
        this.logger.error(`Failed to upsert failure code ${code.code}`, { err })
      }
    }

    const result: SeedResult = { upserted, skipped: 0, errors }
    this.logger.info('FailureCodeSeeder: batch complete', result)
    return result
  }

  // ── Private: CSV parser ───────────────────────────────────────────────────

  private static async parseCSV(filePath: string): Promise<ISO14224Code[]> {
    return new Promise((resolve, reject) => {
      const rows: ISO14224Code[] = []
      let headers: string[] = []
      let lineNum = 0

      const rl = createInterface({
        input: createReadStream(filePath, { encoding: 'utf8' }),
      })

      rl.on('line', (raw: string) => {
        const line = raw.trim()
        if (line.startsWith('#') || line.length === 0) return

        lineNum += 1

        if (lineNum === 1) {
          // Header row
          headers = line.split(',').map((h) => h.trim().toLowerCase())
          return
        }

        const values = FailureCodeSeeder.splitCSVLine(line)
        const row: Record<string, string> = {}

        headers.forEach((h, i) => {
          row[h] = values[i]?.trim() ?? ''
        })

        const { code } = row
        const { name } = row

        if (!code || !name) return // skip incomplete rows

        rows.push({
          code,
          name,
          category: row.category ?? 'Uncategorised',
          system: row.system ?? '',
          notes: row.notes ?? '',
        })
      })

      rl.on('close', () => resolve(rows))
      rl.on('error', (err) => reject(err))
    })
  }

  /**
   * Minimal CSV line splitter that handles quoted fields.
   * Does NOT handle escaped quotes within quoted fields (good enough for
   * the ISO 14224 taxonomy which has no such edge cases).
   */
  private static splitCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }
}
