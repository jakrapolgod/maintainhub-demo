import type { PrismaClient } from '@prisma/client'

// ── Tenant-scoped models ──────────────────────────────────────────────────────
//
// Only models whose schema includes a `tenantId String` column.
// Models without tenantId (RefreshToken, FailureCode, LaborEntry, PartUsage,
// Comment) are intentionally omitted — they are reachable only through FK
// relations that are already tenant-scoped, so they cannot leak cross-tenant
// data through normal query paths.

const TENANT_MODELS = new Set([
  'User',
  'Asset',
  'AssetCategory',
  'Location',
  'WorkOrder',
  'PMSchedule',
  'Part',
  'Attachment',
  'AuditLog',
  'Invitation',
  'WebhookEndpoint',
  'WebhookDelivery',
  'Integration',
  'Site',
  'PermitToWork',
  'ContractorToken',
])

// ── Operations that carry a WHERE clause ──────────────────────────────────────
//
// tenantId is injected as an additional WHERE condition on every operation in
// this set, overwriting any explicit tenantId the caller might have provided.
// The overwrite is intentional and critical: it prevents a buggy or malicious
// route handler from reading another tenant's data by supplying a crafted WHERE.
//
// findUnique is included even though the Prisma TypeScript types do not accept
// non-unique fields in its WHERE clause. The Prisma query engine processes the
// extra condition at the SQL level (WHERE id = ? AND tenant_id = ?), achieving
// isolation for direct-by-ID lookups. Application code should prefer findFirst
// on tenant-scoped models for clarity, but findUnique is safe here in practice.

const FILTER_OPS = new Set([
  'findUnique', // direct-by-ID; extra WHERE handled at SQL level
  'findUniqueOrThrow', // same as above
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
])

// ── Extension ─────────────────────────────────────────────────────────────────

/**
 * Returns a Prisma client extended with a query-level middleware that
 * automatically injects `tenantId` into every SQL statement for models that
 * carry a tenantId column.
 *
 * Security guarantees
 * ───────────────────
 * 1. READ isolation  — tenantId is added to the WHERE clause of every read
 *    operation (findMany, findFirst, count, …). A caller-supplied WHERE that
 *    contains a different tenantId is overwritten.
 *
 * 2. WRITE isolation — tenantId is injected into the `data` payload of create
 *    and createMany operations. A caller-supplied data.tenantId is overwritten.
 *
 * 3. UPDATE/DELETE isolation — tenantId is added to the WHERE clause so an
 *    update or delete can only affect rows belonging to the scoped tenant.
 *
 * 4. Non-tenant models — pass through unchanged.
 *
 * Usage
 * ─────
 *   const db = withTenantFilter(fastify.prisma, request.user.tid)
 *   await db.asset.findMany()               // WHERE tenant_id = ?
 *   await db.workOrder.create({ data: {} }) // data.tenantId auto-set
 *
 * The returned type is a complex Prisma extension intersection. Use
 * `TenantClient` (the exported alias) for type annotations.
 */
export function withTenantFilter(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!TENANT_MODELS.has(model as string)) {
            // Non-tenant model — pass through without modification
            return query(args)
          }

          // Never mutate the original args object
          let scopedArgs: typeof args

          if (operation === 'create') {
            // Overwrite caller-supplied data.tenantId with the scoped value
            scopedArgs = {
              ...args,
              data: { ...(args.data as Record<string, unknown>), tenantId },
            }
          } else if (operation === 'createMany') {
            scopedArgs = {
              ...args,
              data: (args.data as Record<string, unknown>[]).map((row) => ({
                ...row,
                tenantId,
              })),
            }
          } else if (FILTER_OPS.has(operation as string)) {
            // Overwrite caller-supplied where.tenantId with the scoped value.
            // This is the critical safety invariant: even if a route handler
            // accidentally (or maliciously) supplies where: { tenantId: 'other' },
            // this extension silently corrects it.
            scopedArgs = {
              ...args,
              where: {
                ...(args.where as Record<string, unknown> | undefined),
                tenantId,
              },
            }
          } else {
            scopedArgs = args
          }

          return query(scopedArgs)
        },
      },
    },
  })
}

/** Convenience type alias for the return value of withTenantFilter. */
export type TenantClient = ReturnType<typeof withTenantFilter>
