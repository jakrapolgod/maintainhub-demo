/**
 * Maintenance report generation routes.
 *
 * All routes require MANAGER or ADMIN (via requirePermission('report', 'create'/'read')).
 * Every `/generate` route queries live tenant data, renders a PDF with
 * ReportPDFBuilder, uploads it to MinIO, and writes a Report record.
 *
 * POST /pm-compliance/generate        — PM schedule compliance vs 95% target
 * POST /downtime/generate             — corrective-WO downtime, MTBF/MTTR, Pareto
 * POST /work-order-summary/generate   — WO counts, SLA compliance, repeat failures
 * POST /corrective-actions/generate   — NCR-style corrective-action register
 * POST /ptw-summary/generate          — permit-to-work summary
 * GET  /                              — history list (optionally filtered by type)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import type { ReportType } from '@prisma/client'
import { requirePermission } from '../../../middleware/require-permission.js'
import { ReportPDFBuilder } from '../../../lib/reports/ReportPDFBuilder.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'

// ── Shared schema ────────────────────────────────────────────────────────────

const generateBodySchema = z.object({
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  siteId: z.string().optional(),
})

const historyQuerySchema = z.object({
  reportType: z
    .enum(['PM_COMPLIANCE', 'DOWNTIME', 'WORK_ORDER_SUMMARY', 'CORRECTIVE_ACTIONS', 'PTW_SUMMARY'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const DOC_PREFIX: Record<ReportType, string> = {
  PM_COMPLIANCE: 'MH-RPT-PMC',
  DOWNTIME: 'MH-RPT-DWN',
  WORK_ORDER_SUMMARY: 'MH-RPT-WOS',
  CORRECTIVE_ACTIONS: 'MH-RPT-CA',
  PTW_SUMMARY: 'MH-RPT-PTW',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateDocNumber(db: TenantClient, reportType: ReportType): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${DOC_PREFIX[reportType]}-${year}-`

  const last = await db.report.findFirst({
    where: { reportType, docNumber: { startsWith: prefix } },
    orderBy: { docNumber: 'desc' },
    select: { docNumber: true },
  })

  let seq = 1
  if (last?.docNumber) {
    const parsed = parseInt(last.docNumber.slice(prefix.length), 10)
    if (!Number.isNaN(parsed)) seq = parsed + 1
  }
  return `${prefix}${String(seq).padStart(6, '0')}`
}

function trafficLight(pct: number, target: number): 'green' | 'yellow' | 'red' {
  if (pct >= target) return 'green'
  if (pct >= target - 10) return 'yellow'
  return 'red'
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const maintenanceReportRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET / ────────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: requirePermission('report', 'read') }, async (request, reply) => {
    const q = historyQuerySchema.parse(request.query)
    const reports = await request.db.report.findMany({
      where: q.reportType ? { reportType: q.reportType } : {},
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: {
        id: true,
        reportType: true,
        docNumber: true,
        periodFrom: true,
        periodTo: true,
        siteId: true,
        pdfKey: true,
        createdAt: true,
        generatedBy: { select: { id: true, name: true } },
      },
    })

    const withUrls = await Promise.all(
      reports.map(async (r) => ({
        id: r.id,
        reportType: r.reportType,
        docNumber: r.docNumber,
        periodFrom: r.periodFrom,
        periodTo: r.periodTo,
        siteId: r.siteId,
        createdAt: r.createdAt,
        generatedBy: r.generatedBy.name,
        pdfUrl: await fastify.minio.presignedGetObject(fastify.minioBucket, r.pdfKey, 3600),
      })),
    )

    return reply.send({ reports: withUrls })
  })

  // ── POST /pm-compliance/generate ───────────────────────────────────────────
  fastify.post(
    '/pm-compliance/generate',
    { preHandler: requirePermission('report', 'create') },
    async (request, reply) => {
      const body = generateBodySchema.parse(request.body)
      const tenantId = request.user.tid
      const { periodFrom, periodTo, siteId } = body
      const periodDays = Math.max(1, (periodTo.getTime() - periodFrom.getTime()) / 86_400_000)

      const schedules = await request.db.pMSchedule.findMany({
        where: {
          isActive: true,
          ...(siteId && { asset: { siteId } }),
        },
        select: {
          id: true,
          title: true,
          triggerType: true,
          calendarRule: true,
          nextDue: true,
          asset: { select: { id: true, name: true, assetNumber: true } },
        },
      })

      const auditRows = await request.db.auditLog.findMany({
        where: {
          action: 'CREATE_WORK_ORDER',
          createdAt: { gte: periodFrom, lte: periodTo },
        },
        select: { after: true },
      })

      const actualByScheduleId = new Map<string, number>()
      for (const row of auditRows) {
        const after = row.after as { pmScheduleId?: string } | null
        if (after?.pmScheduleId) {
          actualByScheduleId.set(
            after.pmScheduleId,
            (actualByScheduleId.get(after.pmScheduleId) ?? 0) + 1,
          )
        }
      }

      const FREQ_PER_YEAR: Record<string, number> = {
        daily: 365,
        weekly: 52,
        monthly: 12,
        quarterly: 4,
        annually: 1,
      }

      const detailRows: (string | number)[][] = []
      const overdue: (string | number)[][] = []
      let totalPlanned = 0
      let totalActual = 0

      for (const s of schedules) {
        const rule = s.calendarRule as { frequency?: string; interval?: number } | null
        const perYear =
          s.triggerType === 'CALENDAR' && rule?.frequency
            ? (FREQ_PER_YEAR[rule.frequency] ?? 0) / (rule.interval ?? 1)
            : 0
        const planned = Math.round((perYear * periodDays) / 365)
        const actual = actualByScheduleId.get(s.id) ?? 0
        let compliancePct: number
        if (planned === 0) {
          compliancePct = actual > 0 ? 100 : 0
        } else {
          compliancePct = Math.min(Math.round((actual / planned) * 100), 100)
        }

        totalPlanned += planned
        totalActual += actual

        detailRows.push([
          s.title,
          `${s.asset.name} (${s.asset.assetNumber})`,
          planned,
          actual,
          `${compliancePct}%`,
        ])

        if (s.nextDue && s.nextDue < periodTo) {
          overdue.push([
            s.title,
            `${s.asset.name} (${s.asset.assetNumber})`,
            s.nextDue.toISOString().slice(0, 10),
          ])
        }
      }

      let overallPct: number
      if (totalPlanned === 0) {
        overallPct = totalActual > 0 ? 100 : 0
      } else {
        overallPct = Math.min(Math.round((totalActual / totalPlanned) * 100), 100)
      }

      const docNumber = await generateDocNumber(request.db, 'PM_COMPLIANCE')
      const builder = new ReportPDFBuilder({
        title: 'PM Compliance Report',
        docNumber,
        periodFrom,
        periodTo,
        generatedBy: request.user.email,
      })
      builder.addDocControlTable({ revision: 'A', preparedBy: request.user.email })
      builder.addKPISection('Key Performance Indicators', [
        {
          label: 'PM Compliance',
          value: `${overallPct}%`,
          target: 'Target: ≥ 95%',
          status: trafficLight(overallPct, 95),
        },
        { label: 'Total Schedules', value: String(schedules.length) },
        { label: 'Planned PMs', value: String(totalPlanned) },
        { label: 'Completed PMs', value: String(totalActual) },
      ])
      builder.addTable(
        'PM Schedule Detail',
        ['Schedule', 'Asset', 'Planned', 'Actual', 'Compliance %'],
        detailRows,
      )
      builder.addTable('Overdue PM Schedules', ['Schedule', 'Asset', 'Next Due'], overdue)
      builder.addSignatureBlock()

      const pdfBuffer = await builder.finish()
      const pdfKey = `reports/${tenantId}/${docNumber}.pdf`
      await fastify.minio.putObject(fastify.minioBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
        'Content-Type': 'application/pdf',
      })

      const report = await request.db.report.create({
        data: {
          tenantId,
          reportType: 'PM_COMPLIANCE',
          docNumber,
          periodFrom,
          periodTo,
          siteId: siteId ?? null,
          data: { overallPct, totalPlanned, totalActual, scheduleCount: schedules.length },
          pdfKey,
          generatedById: request.user.sub,
        },
      })

      const pdfUrl = await fastify.minio.presignedGetObject(fastify.minioBucket, pdfKey, 3600)
      return reply.send({ id: report.id, docNumber, pdfUrl })
    },
  )

  // ── POST /downtime/generate ─────────────────────────────────────────────────
  fastify.post(
    '/downtime/generate',
    { preHandler: requirePermission('report', 'create') },
    async (request, reply) => {
      const body = generateBodySchema.parse(request.body)
      const tenantId = request.user.tid
      const { periodFrom, periodTo, siteId } = body

      const workOrders = await request.db.workOrder.findMany({
        where: {
          type: 'CORRECTIVE',
          status: 'COMPLETED',
          completedAt: { gte: periodFrom, lte: periodTo },
          ...(siteId && { siteId }),
        },
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          asset: { select: { id: true, name: true, assetNumber: true } },
          failureCode: { select: { category: true, name: true } },
        },
      })

      // ── Per-asset downtime / MTTR ──────────────────────────────────────────
      const assetStats = new Map<string, { name: string; downtimeHours: number; count: number }>()
      const categoryStats = new Map<string, number>()
      let totalDowntimeHours = 0

      for (const wo of workOrders) {
        const start = wo.startedAt ?? wo.createdAt
        const end = wo.completedAt!
        const hours = hoursBetween(start, end)
        totalDowntimeHours += hours

        const key = wo.asset.id
        const existing = assetStats.get(key) ?? {
          name: `${wo.asset.name} (${wo.asset.assetNumber})`,
          downtimeHours: 0,
          count: 0,
        }
        existing.downtimeHours += hours
        existing.count += 1
        assetStats.set(key, existing)

        const cat = wo.failureCode?.category ?? 'Uncategorized'
        categoryStats.set(cat, (categoryStats.get(cat) ?? 0) + hours)
      }

      const periodHours = Math.max(1, (periodTo.getTime() - periodFrom.getTime()) / 3_600_000)
      const failureCount = workOrders.length
      const mtbfHours = failureCount > 0 ? round1(periodHours / failureCount) : 0
      const mttrHours = failureCount > 0 ? round1(totalDowntimeHours / failureCount) : 0

      const paretoData = [...assetStats.entries()]
        .map(([, v]) => ({ label: v.name, value: round1(v.downtimeHours) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)

      const categoryRows = [...categoryStats.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, hours]) => [cat, round1(hours)])

      const docNumber = await generateDocNumber(request.db, 'DOWNTIME')
      const builder = new ReportPDFBuilder({
        title: 'Downtime & Reliability Report',
        docNumber,
        periodFrom,
        periodTo,
        generatedBy: request.user.email,
      })
      builder.addDocControlTable({ revision: 'A', preparedBy: request.user.email })
      builder.addKPISection('Key Performance Indicators', [
        { label: 'MTBF', value: `${mtbfHours} h` },
        { label: 'MTTR', value: `${mttrHours} h` },
        { label: 'Total Downtime', value: `${round1(totalDowntimeHours)} h` },
        { label: 'Corrective WOs', value: String(failureCount) },
      ])
      builder.addParetoSection('Top 10 Assets by Downtime', paretoData, ' h')
      builder.addTable(
        'Root Cause Breakdown (hours)',
        ['Failure Category', 'Downtime Hours'],
        categoryRows,
      )
      builder.addSignatureBlock()

      const pdfBuffer = await builder.finish()
      const pdfKey = `reports/${tenantId}/${docNumber}.pdf`
      await fastify.minio.putObject(fastify.minioBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
        'Content-Type': 'application/pdf',
      })

      const report = await request.db.report.create({
        data: {
          tenantId,
          reportType: 'DOWNTIME',
          docNumber,
          periodFrom,
          periodTo,
          siteId: siteId ?? null,
          data: {
            mtbfHours,
            mttrHours,
            totalDowntimeHours: round1(totalDowntimeHours),
            failureCount,
          },
          pdfKey,
          generatedById: request.user.sub,
        },
      })

      const pdfUrl = await fastify.minio.presignedGetObject(fastify.minioBucket, pdfKey, 3600)
      return reply.send({ id: report.id, docNumber, pdfUrl })
    },
  )

  // ── POST /work-order-summary/generate ──────────────────────────────────────
  fastify.post(
    '/work-order-summary/generate',
    { preHandler: requirePermission('report', 'create') },
    async (request, reply) => {
      const body = generateBodySchema.parse(request.body)
      const tenantId = request.user.tid
      const { periodFrom, periodTo, siteId } = body

      const workOrders = await request.db.workOrder.findMany({
        where: {
          createdAt: { gte: periodFrom, lte: periodTo },
          ...(siteId && { siteId }),
        },
        select: {
          id: true,
          woNumber: true,
          type: true,
          status: true,
          priority: true,
          createdAt: true,
          completedAt: true,
          slaDeadline: true,
          assigneeIds: true,
          assetId: true,
        },
      })

      const byType = new Map<string, number>()
      const byStatus = new Map<string, number>()
      const byPriority = new Map<string, number>()
      const byTechnician = new Map<string, number>()
      const assetFailureCount = new Map<string, number>()

      let slaTotal = 0
      let slaMet = 0

      for (const wo of workOrders) {
        byType.set(wo.type, (byType.get(wo.type) ?? 0) + 1)
        byStatus.set(wo.status, (byStatus.get(wo.status) ?? 0) + 1)
        byPriority.set(wo.priority, (byPriority.get(wo.priority) ?? 0) + 1)
        assetFailureCount.set(wo.assetId, (assetFailureCount.get(wo.assetId) ?? 0) + 1)

        for (const techId of wo.assigneeIds) {
          byTechnician.set(techId, (byTechnician.get(techId) ?? 0) + 1)
        }

        if (wo.slaDeadline) {
          slaTotal += 1
          if (wo.completedAt && wo.completedAt <= wo.slaDeadline) slaMet += 1
        }
      }

      const slaCompliancePct = slaTotal === 0 ? 100 : Math.round((slaMet / slaTotal) * 100)
      const repeatFailures = [...assetFailureCount.values()].filter((c) => c > 1).length

      // Resolve technician names
      const techIds = [...byTechnician.keys()]
      const techs = techIds.length
        ? await request.db.user.findMany({
            where: { id: { in: techIds } },
            select: { id: true, name: true },
          })
        : []
      const techNameById = new Map(techs.map((t) => [t.id, t.name]))

      const docNumber = await generateDocNumber(request.db, 'WORK_ORDER_SUMMARY')
      const builder = new ReportPDFBuilder({
        title: 'Work Order Summary Report',
        docNumber,
        periodFrom,
        periodTo,
        generatedBy: request.user.email,
      })
      builder.addDocControlTable({ revision: 'A', preparedBy: request.user.email })
      builder.addKPISection('Key Performance Indicators', [
        { label: 'Total Work Orders', value: String(workOrders.length) },
        {
          label: 'SLA Compliance',
          value: `${slaCompliancePct}%`,
          target: 'Target: ≥ 90%',
          status: trafficLight(slaCompliancePct, 90),
        },
        { label: 'Repeat Failures', value: String(repeatFailures) },
        {
          label: 'Open / In Progress',
          value: String((byStatus.get('OPEN') ?? 0) + (byStatus.get('IN_PROGRESS') ?? 0)),
        },
      ])
      builder.addTable(
        'Work Orders by Type',
        ['Type', 'Count'],
        [...byType.entries()].map(([k, v]) => [k, v]),
      )
      builder.addTable(
        'Work Orders by Status',
        ['Status', 'Count'],
        [...byStatus.entries()].map(([k, v]) => [k, v]),
      )
      builder.addTable(
        'Work Orders by Priority',
        ['Priority', 'Count'],
        [...byPriority.entries()].map(([k, v]) => [k, v]),
      )
      builder.addTable(
        'SLA Compliance',
        ['Metric', 'Value'],
        [
          ['WOs with SLA deadline', slaTotal],
          ['Met SLA', slaMet],
          ['SLA Compliance %', `${slaCompliancePct}%`],
        ],
      )
      builder.addTable(
        'Work Orders per Technician',
        ['Technician', 'WO Count'],
        [...byTechnician.entries()].map(([id, count]) => [techNameById.get(id) ?? id, count]),
      )
      builder.addSignatureBlock()

      const pdfBuffer = await builder.finish()
      const pdfKey = `reports/${tenantId}/${docNumber}.pdf`
      await fastify.minio.putObject(fastify.minioBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
        'Content-Type': 'application/pdf',
      })

      const report = await request.db.report.create({
        data: {
          tenantId,
          reportType: 'WORK_ORDER_SUMMARY',
          docNumber,
          periodFrom,
          periodTo,
          siteId: siteId ?? null,
          data: { total: workOrders.length, slaCompliancePct, repeatFailures },
          pdfKey,
          generatedById: request.user.sub,
        },
      })

      const pdfUrl = await fastify.minio.presignedGetObject(fastify.minioBucket, pdfKey, 3600)
      return reply.send({ id: report.id, docNumber, pdfUrl })
    },
  )

  // ── POST /corrective-actions/generate ──────────────────────────────────────
  fastify.post(
    '/corrective-actions/generate',
    { preHandler: requirePermission('report', 'create') },
    async (request, reply) => {
      const body = generateBodySchema.parse(request.body)
      const tenantId = request.user.tid
      const { periodFrom, periodTo, siteId } = body

      const workOrders = await request.db.workOrder.findMany({
        where: {
          type: 'CORRECTIVE',
          createdAt: { gte: periodFrom, lte: periodTo },
          resolution: { not: null },
          ...(siteId && { siteId }),
        },
        select: {
          woNumber: true,
          title: true,
          resolution: true,
          completedAt: true,
          asset: { select: { name: true, assetNumber: true } },
          failureCode: { select: { name: true, category: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      const rows = workOrders.map((wo) => [
        wo.woNumber,
        `${wo.asset.name} (${wo.asset.assetNumber})`,
        wo.failureCode ? `${wo.failureCode.category}: ${wo.failureCode.name}` : '—',
        wo.resolution ?? '—',
        wo.completedAt ? wo.completedAt.toISOString().slice(0, 10) : '—',
      ])

      const docNumber = await generateDocNumber(request.db, 'CORRECTIVE_ACTIONS')
      const builder = new ReportPDFBuilder({
        title: 'Corrective Actions Report (NCR Register)',
        docNumber,
        periodFrom,
        periodTo,
        generatedBy: request.user.email,
      })
      builder.addDocControlTable({ revision: 'A', preparedBy: request.user.email })
      builder.addKPISection('Key Performance Indicators', [
        { label: 'Corrective Actions Logged', value: String(workOrders.length) },
      ])
      builder.addTable(
        'Corrective Action Register',
        ['WO Number', 'Asset', 'Root Cause', 'Action Taken', 'Closed Date'],
        rows,
        [70, 100, 130, 175, 60],
      )
      builder.addSignatureBlock()

      const pdfBuffer = await builder.finish()
      const pdfKey = `reports/${tenantId}/${docNumber}.pdf`
      await fastify.minio.putObject(fastify.minioBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
        'Content-Type': 'application/pdf',
      })

      const report = await request.db.report.create({
        data: {
          tenantId,
          reportType: 'CORRECTIVE_ACTIONS',
          docNumber,
          periodFrom,
          periodTo,
          siteId: siteId ?? null,
          data: { count: workOrders.length },
          pdfKey,
          generatedById: request.user.sub,
        },
      })

      const pdfUrl = await fastify.minio.presignedGetObject(fastify.minioBucket, pdfKey, 3600)
      return reply.send({ id: report.id, docNumber, pdfUrl })
    },
  )

  // ── POST /ptw-summary/generate ──────────────────────────────────────────────
  fastify.post(
    '/ptw-summary/generate',
    { preHandler: requirePermission('report', 'create') },
    async (request, reply) => {
      const body = generateBodySchema.parse(request.body)
      const tenantId = request.user.tid
      const { periodFrom, periodTo, siteId } = body

      const permits = await request.db.permitToWork.findMany({
        where: {
          createdAt: { gte: periodFrom, lte: periodTo },
          ...(siteId && { siteId }),
        },
        select: {
          permitNumber: true,
          title: true,
          status: true,
          riskLevel: true,
          submittedAt: true,
          approvedAt: true,
          closedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      const statusCounts = new Map<string, number>()
      let approvalHoursTotal = 0
      let approvalCount = 0

      for (const p of permits) {
        statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1)
        if (p.submittedAt && p.approvedAt) {
          approvalHoursTotal += hoursBetween(p.submittedAt, p.approvedAt)
          approvalCount += 1
        }
      }

      const avgApprovalHours = approvalCount > 0 ? round1(approvalHoursTotal / approvalCount) : 0

      const rows = permits.map((p) => [
        p.permitNumber,
        p.title,
        p.riskLevel,
        p.status,
        p.submittedAt ? p.submittedAt.toISOString().slice(0, 10) : '—',
        p.approvedAt ? p.approvedAt.toISOString().slice(0, 10) : '—',
        p.closedAt ? p.closedAt.toISOString().slice(0, 10) : '—',
      ])

      const docNumber = await generateDocNumber(request.db, 'PTW_SUMMARY')
      const builder = new ReportPDFBuilder({
        title: 'Permit-to-Work Summary Report',
        docNumber,
        periodFrom,
        periodTo,
        generatedBy: request.user.email,
      })
      builder.addDocControlTable({ revision: 'A', preparedBy: request.user.email })
      builder.addKPISection('Key Performance Indicators', [
        { label: 'Total Permits', value: String(permits.length) },
        { label: 'Approved', value: String(statusCounts.get('APPROVED') ?? 0) },
        { label: 'Closed', value: String(statusCounts.get('CLOSED') ?? 0) },
        { label: 'Avg. Approval Time', value: `${avgApprovalHours} h` },
      ])
      builder.addTable(
        'Permits by Status',
        ['Status', 'Count'],
        [...statusCounts.entries()].map(([k, v]) => [k, v]),
      )
      builder.addTable(
        'Permit-to-Work List',
        ['Permit No.', 'Title', 'Risk Level', 'Status', 'Submitted', 'Approved', 'Closed'],
        rows,
        [60, 130, 60, 70, 60, 60, 60],
      )
      builder.addParagraphSection(
        'Safety Summary',
        `${permits.length} permit(s) were processed in this period. ${
          statusCounts.get('REJECTED') ?? 0
        } permit(s) were rejected. Average time from submission to approval was ${avgApprovalHours} hour(s).`,
      )
      builder.addSignatureBlock()

      const pdfBuffer = await builder.finish()
      const pdfKey = `reports/${tenantId}/${docNumber}.pdf`
      await fastify.minio.putObject(fastify.minioBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
        'Content-Type': 'application/pdf',
      })

      const report = await request.db.report.create({
        data: {
          tenantId,
          reportType: 'PTW_SUMMARY',
          docNumber,
          periodFrom,
          periodTo,
          siteId: siteId ?? null,
          data: { total: permits.length, avgApprovalHours },
          pdfKey,
          generatedById: request.user.sub,
        },
      })

      const pdfUrl = await fastify.minio.presignedGetObject(fastify.minioBucket, pdfKey, 3600)
      return reply.send({ id: report.id, docNumber, pdfUrl })
    },
  )
}

export default maintenanceReportRoutes
