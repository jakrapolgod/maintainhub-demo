/**
 * ReportPDFBuilder — shared layout primitives for ISO-style maintenance reports.
 *
 * Produces a PDFKit document with a consistent controlled-document header,
 * doc-control table, KPI summary (with traffic-light status), data tables,
 * a simple Pareto bar chart, and a signature block.
 *
 * Usage:
 *   const builder = new ReportPDFBuilder({
 *     title: 'PM Compliance Report',
 *     docNumber: 'MH-RPT-PMC-2026-000001',
 *     periodFrom: from,
 *     periodTo: to,
 *     generatedBy: 'Jane Doe',
 *   })
 *   builder.addDocControlTable({ revision: 'A', preparedBy: 'Jane Doe' })
 *   builder.addKPISection([{ label: 'PM Compliance', value: '92%', status: 'yellow' }])
 *   builder.addTable('PM Schedule Detail', ['Schedule', 'Asset', 'Compliance %'], rows)
 *   builder.addSignatureBlock()
 *   const buffer = await builder.finish()
 */
import PDFDocument from 'pdfkit'

export interface ReportPeriod {
  title: string
  docNumber: string
  periodFrom: Date
  periodTo: Date
  generatedBy: string
  /** Optional sub-heading, e.g. site/location name */
  scope?: string
}

export type TrafficLightStatus = 'green' | 'yellow' | 'red'

export interface KPIItem {
  label: string
  value: string
  /** Optional target description, e.g. "Target: ≥ 95%" */
  target?: string
  status?: TrafficLightStatus
}

const STATUS_COLORS: Record<TrafficLightStatus, string> = {
  green: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
}

const PAGE_MARGIN = 40

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export class ReportPDFBuilder {
  readonly doc: PDFKit.PDFDocument

  private readonly chunks: Buffer[] = []

  constructor(private readonly meta: ReportPeriod) {
    this.doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true })
    this.doc.on('data', (chunk: Buffer) => this.chunks.push(chunk))
    this.addHeader()
  }

  // ── Header ──────────────────────────────────────────────────────────────

  private addHeader(): void {
    const { doc, meta } = this
    doc.fontSize(16).font('Helvetica-Bold').text('MaintainHub', PAGE_MARGIN, PAGE_MARGIN)
    doc.fontSize(10).font('Helvetica').text(meta.docNumber, { align: 'right' })

    doc.moveDown(0.5)
    doc.fontSize(14).font('Helvetica-Bold').text(meta.title)
    if (meta.scope) {
      doc.fontSize(10).font('Helvetica').text(meta.scope)
    }

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        `Reporting period: ${fmtDate(meta.periodFrom)} to ${fmtDate(meta.periodTo)}    |    Generated: ${fmtDate(new Date())} by ${meta.generatedBy}`,
      )
      .fillColor('#000000')

    this.hr()
  }

  private hr(): void {
    const { doc } = this
    doc.moveDown(0.5)
    doc
      .moveTo(PAGE_MARGIN, doc.y)
      .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .strokeColor('#000000')
    doc.moveDown(0.5)
  }

  // ── Doc control table ──────────────────────────────────────────────────

  addDocControlTable(opts: {
    revision: string
    preparedBy: string
    reviewedBy?: string
    approvedBy?: string
  }): this {
    const { doc } = this
    const rows: [string, string][] = [
      ['Document No.', this.meta.docNumber],
      ['Revision', opts.revision],
      ['Prepared by', opts.preparedBy],
      ['Reviewed by', opts.reviewedBy ?? '—'],
      ['Approved by', opts.approvedBy ?? '—'],
      ['Issue date', fmtDate(new Date())],
    ]

    doc.fontSize(9).font('Helvetica-Bold').text('Document Control')
    doc.moveDown(0.2)

    const colWidth = (doc.page.width - PAGE_MARGIN * 2) / 2
    const labelWidth = 110
    let { y } = doc
    for (const [label, value] of rows) {
      doc.font('Helvetica-Bold').fontSize(8).text(label, PAGE_MARGIN, y, { width: labelWidth })
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(value, PAGE_MARGIN + labelWidth, y, { width: colWidth - labelWidth })
      y = doc.y + 2
    }
    doc.y = y
    this.hr()
    return this
  }

  // ── KPI summary with traffic lights ──────────────────────────────────────

  addKPISection(title: string, items: KPIItem[]): this {
    const { doc } = this
    doc.fontSize(11).font('Helvetica-Bold').text(title)
    doc.moveDown(0.3)

    const usableWidth = doc.page.width - PAGE_MARGIN * 2
    const cardWidth = usableWidth / 2 - 6
    const cardHeight = 46
    let x = PAGE_MARGIN
    let { y } = doc

    items.forEach((item, i) => {
      if (i % 2 === 0 && i > 0) {
        x = PAGE_MARGIN
        y += cardHeight + 6
      } else if (i % 2 === 1) {
        x = PAGE_MARGIN + cardWidth + 12
      }

      if (y + cardHeight > doc.page.height - PAGE_MARGIN) {
        doc.addPage()
        y = doc.y
      }

      doc.roundedRect(x, y, cardWidth, cardHeight, 3).strokeColor('#dddddd').stroke()

      if (item.status) {
        doc
          .circle(x + 12, y + 12, 4)
          .fillColor(STATUS_COLORS[item.status])
          .fill()
          .fillColor('#000000')
      }

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(item.label, x + 22, y + 6, { width: cardWidth - 30 })
        .fillColor('#000000')

      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .text(item.value, x + 10, y + 18, {
          width: cardWidth - 20,
        })

      if (item.target) {
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#888888')
          .text(item.target, x + 10, y + 36, { width: cardWidth - 20 })
          .fillColor('#000000')
      }
    })

    doc.y = y + cardHeight + 10
    this.hr()
    return this
  }

  // ── Generic data table ────────────────────────────────────────────────

  addTable(
    title: string,
    headers: string[],
    rows: (string | number)[][],
    colWidths?: number[],
  ): this {
    const { doc } = this
    if (rows.length === 0) {
      doc.fontSize(11).font('Helvetica-Bold').text(title)
      doc.moveDown(0.2)
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#888888')
        .text('No records for this period.')
        .fillColor('#000000')
      doc.moveDown(0.5)
      return this
    }

    doc.fontSize(11).font('Helvetica-Bold').text(title)
    doc.moveDown(0.2)

    const usableWidth = doc.page.width - PAGE_MARGIN * 2
    const widths = colWidths ?? headers.map(() => usableWidth / headers.length)
    const rowHeight = 18

    const drawRow = (
      cells: (string | number)[],
      bold: boolean,
      y: number,
      shade?: string,
    ): void => {
      if (shade) {
        doc.rect(PAGE_MARGIN, y, usableWidth, rowHeight).fill(shade).fillColor('#000000')
      }
      let x = PAGE_MARGIN
      cells.forEach((cell, i) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8)
          .text(String(cell), x + 3, y + 5, { width: widths[i]! - 6, ellipsis: true })
        x += widths[i]!
      })
    }

    const ensureSpace = (): number => {
      let { y } = doc
      if (y + rowHeight > doc.page.height - PAGE_MARGIN) {
        doc.addPage()
        y = doc.y
        drawRow(headers, true, y, '#f3f4f6')
        y += rowHeight
        doc.y = y
      }
      return doc.y
    }

    let { y } = doc
    drawRow(headers, true, y, '#f3f4f6')
    y += rowHeight
    doc.y = y

    rows.forEach((row, i) => {
      y = ensureSpace()
      drawRow(row, false, y, i % 2 === 1 ? '#fafafa' : undefined)
      y += rowHeight
      doc.y = y
    })

    doc.moveDown(0.5)
    this.hr()
    return this
  }

  // ── Pareto-style bar chart (top-N by value) ──────────────────────────────

  addParetoSection(title: string, data: { label: string; value: number }[], unit = ''): this {
    const { doc } = this
    doc.fontSize(11).font('Helvetica-Bold').text(title)
    doc.moveDown(0.2)

    if (data.length === 0) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#888888')
        .text('No data for this period.')
        .fillColor('#000000')
      doc.moveDown(0.5)
      return this
    }

    const usableWidth = doc.page.width - PAGE_MARGIN * 2
    const maxValue = Math.max(...data.map((d) => d.value), 1)
    const labelWidth = 140
    const barAreaWidth = usableWidth - labelWidth - 50
    const barHeight = 12
    const gap = 6

    let { y } = doc
    for (const item of data) {
      if (y + barHeight + gap > doc.page.height - PAGE_MARGIN) {
        doc.addPage()
        y = doc.y
      }
      const barWidth = Math.max((item.value / maxValue) * barAreaWidth, 2)
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(item.label, PAGE_MARGIN, y + 2, { width: labelWidth - 5, ellipsis: true })
      doc
        .rect(PAGE_MARGIN + labelWidth, y, barWidth, barHeight)
        .fillColor('#6366f1')
        .fill()
        .fillColor('#000000')
      doc.fontSize(8).text(`${item.value}${unit}`, PAGE_MARGIN + labelWidth + barWidth + 4, y + 2)
      y += barHeight + gap
    }
    doc.y = y
    doc.moveDown(0.5)
    this.hr()
    return this
  }

  // ── Free-text section ─────────────────────────────────────────────────

  addParagraphSection(title: string, text: string): this {
    const { doc } = this
    doc.fontSize(11).font('Helvetica-Bold').text(title)
    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica').text(text)
    doc.moveDown(0.5)
    this.hr()
    return this
  }

  // ── Signature block ───────────────────────────────────────────────────

  addSignatureBlock(roles: string[] = ['Prepared by', 'Reviewed by', 'Approved by']): this {
    const { doc } = this
    if (doc.y + 80 > doc.page.height - PAGE_MARGIN) {
      doc.addPage()
    }
    doc.moveDown(1)
    const usableWidth = doc.page.width - PAGE_MARGIN * 2
    const colWidth = usableWidth / roles.length
    const { y } = doc

    roles.forEach((role, i) => {
      const x = PAGE_MARGIN + i * colWidth
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(role, x, y, { width: colWidth - 10 })
      doc
        .moveTo(x, y + 36)
        .lineTo(x + colWidth - 20, y + 36)
        .strokeColor('#999999')
        .stroke()
        .strokeColor('#000000')
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#888888')
        .text('Name / Signature / Date', x, y + 38, { width: colWidth - 10 })
        .fillColor('#000000')
    })
    doc.y = y + 50
    return this
  }

  // ── Finalize ───────────────────────────────────────────────────────────

  async finish(): Promise<Buffer> {
    const { doc } = this
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(this.chunks)))
      doc.on('error', reject)
      doc.end()
    })
  }
}
