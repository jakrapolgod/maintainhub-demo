/**
 * QRCodeService — generates QR code images and printable asset labels.
 *
 * ## Output formats
 *
 *   generateQRCode   → PNG Buffer — raw QR code for the asset's canonical URL
 *   generateLabel    → PNG Buffer — QR + asset number + name, ready to print
 *   bulkGenerateLabels → Buffer   — ZIP archive, one PNG per asset
 *
 * ## URL format
 *   https://app.maintainhub.com/assets/{assetId}?t={tenantSlug}
 *
 * ## Dependencies
 *   qrcode  — QR generation (MIT)
 *   sharp   — image composition for labels (Apache-2.0)
 *   archiver — ZIP bundling (MIT)
 *
 * ## Label layout (350 × 150 px)
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  [QR 120×120]   AST-000001                                     │
 *   │                 Centrifugal Pump                                │
 *   └────────────────────────────────────────────────────────────────┘
 */
import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'
import QRCode from 'qrcode'
import sharp from 'sharp'
import archiver from 'archiver'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal asset shape required to build a label (avoids importing the full aggregate). */
export interface LabelAsset {
  id: string
  assetNumber: string
  name: string
  tenantSlug: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_BASE_URL = 'https://app.maintainhub.com'
const LABEL_W = 350
const LABEL_H = 150
const QR_SIZE = 120
const QR_MARGIN = 15

// ── Service ───────────────────────────────────────────────────────────────────

export class QRCodeService {
  // ── generateQRCode ─────────────────────────────────────────────────────────

  /**
   * Generate a raw QR code PNG for the given asset.
   *
   * The QR encodes the canonical asset URL:
   *   `https://app.maintainhub.com/assets/{assetId}?t={tenantSlug}`
   *
   * @returns PNG image as a `Buffer`.
   */
  static async generateQRCode(assetId: string, tenantSlug: string): Promise<Buffer> {
    const url = `${APP_BASE_URL}/assets/${assetId}?t=${tenantSlug}`

    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    return png
  }

  // ── generateLabel ──────────────────────────────────────────────────────────

  /**
   * Generate a printable asset label as a PNG image.
   *
   * Layout:
   *   - White 350 × 150 px background
   *   - QR code (120 × 120 px) anchored at top-left with 15 px margin
   *   - Asset number (bold, 16 px) to the right of the QR
   *   - Asset name (14 px) below the asset number
   *
   * @returns PNG Buffer ready for download or printing.
   */
  static async generateLabel(asset: LabelAsset): Promise<Buffer> {
    const qrBuffer = await QRCodeService.generateQRCode(asset.id, asset.tenantSlug)

    // Build SVG text overlay
    const textX = QR_MARGIN + QR_SIZE + 12 // right of QR + gap
    const numberY = QR_MARGIN + 24
    const nameY = numberY + 24
    const maxTextW = LABEL_W - textX - QR_MARGIN

    const escapedNumber = QRCodeService.escapeXml(asset.assetNumber)
    const escapedName = QRCodeService.escapeXml(QRCodeService.truncate(asset.name, 28))

    const svgOverlay = Buffer.from(
      `<svg width="${LABEL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
        <text
          x="${textX}" y="${numberY}"
          font-family="monospace" font-size="16" font-weight="bold"
          fill="#111111" width="${maxTextW}"
        >${escapedNumber}</text>
        <text
          x="${textX}" y="${nameY}"
          font-family="sans-serif" font-size="13"
          fill="#444444" width="${maxTextW}"
        >${escapedName}</text>
      </svg>`,
    )

    const label = await sharp({
      create: {
        width: LABEL_W,
        height: LABEL_H,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        // QR code
        { input: qrBuffer, top: QR_MARGIN, left: QR_MARGIN },
        // Text overlay
        { input: svgOverlay, top: 0, left: 0 },
      ])
      .png()
      .toBuffer()

    return label
  }

  // ── bulkGenerateLabels ────────────────────────────────────────────────────

  /**
   * Generate a ZIP archive containing one PNG label per asset.
   *
   * File naming inside the ZIP: `{assetNumber}_label.png`
   *
   * Labels are generated in parallel (bounded to 5 at a time to avoid OOM).
   *
   * @returns ZIP file as a `Buffer`.
   */
  static async bulkGenerateLabels(assets: LabelAsset[]): Promise<Buffer> {
    const labelEntries = await QRCodeService.chunked(assets, 5, (asset) =>
      QRCodeService.generateLabel(asset).then((data) => ({
        filename: `${asset.assetNumber}_label.png`,
        data,
      })),
    )
    return QRCodeService.buildZip(labelEntries)
  }

  // ── Private: concurrency helper ────────────────────────────────────────────

  /**
   * Process `items` in sequential batches of `size` using `Promise.all` per
   * batch.  Avoids `await-in-loop` while bounding peak concurrency.
   */
  private static async chunked<T, R>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const result: R[] = []
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size))
    }
    const batchResults = await Promise.all(batches.map((batch) => Promise.all(batch.map(fn))))
    for (const br of batchResults) {
      result.push(...br)
    }
    return result
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async buildZip(entries: { filename: string; data: Buffer }[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      const sink = new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk)
          cb()
        },
      })

      sink.on('finish', () => resolve(Buffer.concat(chunks)))
      sink.on('error', reject)

      const archive = archiver('zip', { zlib: { level: 6 } })
      archive.on('error', reject)
      archive.pipe(sink)

      for (const { filename, data } of entries) {
        archive.append(data, { name: filename })
      }

      void archive.finalize()
    })
  }

  /** Truncate a string to `max` characters, appending '…' if needed. */
  private static truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max - 1)}…` : s
  }

  /** Escape characters that are special in XML/SVG text nodes. */
  private static escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}
