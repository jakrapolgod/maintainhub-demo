import type { PrismaClient } from '@prisma/client'
import type { SlaWorkOrderRepository, OverdueWoRow } from './sla-checker-types.js'

/** Implements `findOverdueSLA` directly against Prisma. */
export class PrismaOverdueWoRepository implements SlaWorkOrderRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  async findOverdueSLA(tenantId: string): Promise<OverdueWoRow[]> {
    return this.prisma.workOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        slaDeadline: { lt: new Date() },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        tenantId: true,
        woNumber: true,
        assetId: true,
        priority: true,
        slaDeadline: true,
      },
    }) as Promise<OverdueWoRow[]>
  }
}
