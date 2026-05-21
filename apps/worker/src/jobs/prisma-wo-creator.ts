/**
 * PrismaWorkOrderCreator — creates work orders from PM drafts directly via
 * Prisma, without going through the HTTP application layer (no TenantClient).
 *
 * The HTTP application layer's CreateWorkOrderHandler uses a `TenantClient`
 * (row-level-security Prisma extension) that requires HTTP-context identity.
 * Background workers have no such context, so we write directly to Prisma.
 *
 * ## What this does vs the HTTP handler
 *   ✔  Generates a sequential WO number
 *   ✔  Sets assigneeIds from the PM draft
 *   ✔  Sets type=PREVENTIVE, priority=MEDIUM (PM default)
 *   ✔  Writes an audit log row (system-generated, userId=null)
 *   ✗  Does NOT validate asset ownership (worker trusts the domain object)
 *   ✗  Does NOT run domain events through the domain-events queue (BullMQ)
 */
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { WorkOrderDraft } from '@maintainhub/domain'
import type { WorkOrderCreator } from './pm-scheduler-types.js'

// ── WO number sequence ────────────────────────────────────────────────────────

async function nextWONumber(prisma: PrismaClient, tenantId: string): Promise<string> {
  const last = await prisma.workOrder.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { woNumber: true },
  })

  const lastNum = last?.woNumber ? Number(last.woNumber.replace(/\D/g, '')) || 0 : 0

  return `WO-${String(lastNum + 1).padStart(6, '0')}`
}

// ── SLA default for MEDIUM priority (24 h) ────────────────────────────────────

const MEDIUM_SLA_HOURS = 24

// ── Creator ───────────────────────────────────────────────────────────────────

export class PrismaWorkOrderCreator implements WorkOrderCreator {
  constructor(private readonly prisma: PrismaClient) {}

  async createFromPMDraft(draft: WorkOrderDraft, tenantId: string): Promise<string> {
    const id = randomUUID()
      .replace(/-/g, '')
      .slice(0, 24)
      .replace(/^[^a-z]/, 'c')
    const woNumber = await nextWONumber(this.prisma, tenantId)
    const now = new Date()
    const slaDeadline = new Date(now.getTime() + MEDIUM_SLA_HOURS * 3_600_000)

    await this.prisma.workOrder.create({
      data: {
        id,
        tenantId,
        woNumber,
        title: draft.title,
        description: draft.description,
        type: 'PREVENTIVE',
        priority: 'MEDIUM',
        status: 'OPEN',
        assetId: draft.assetId,
        assigneeIds: draft.assigneeIds,
        slaDeadline,
        createdById: 'system', // system-generated; no human initiator
        createdAt: now,
        updatedAt: now,
      },
    })

    // Audit log (system-generated; userId null = automated trigger)
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: null,
          action: 'CREATE_WORK_ORDER',
          entityType: 'WorkOrder',
          entityId: id,
          after: {
            woNumber,
            title: draft.title,
            type: 'PREVENTIVE',
            priority: 'MEDIUM',
            assetId: draft.assetId,
            pmScheduleId: draft.pmScheduleId,
            source: 'pm-scheduler',
          },
        },
      })
    } catch {
      // Audit failures are non-fatal
    }

    return id
  }
}
