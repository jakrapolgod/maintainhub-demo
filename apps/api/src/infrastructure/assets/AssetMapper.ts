/**
 * AssetMapper — bidirectional translation between Prisma's flat persistence
 * model and the domain's `Asset` aggregate.
 *
 * ## Design decisions
 *
 * ### customFields
 * Stored as Prisma `Json` (plain object). Reconstructed as `Map<string,unknown>`
 * for the domain aggregate; serialised back to `Record<string,unknown>` on write.
 *
 * ### documents
 * The `Attachment` table doubles as asset document storage when `assetId` is set.
 * The mapper converts the Attachment row → `AssetDocument` for the aggregate.
 *
 * ### purchaseCost / assetValue
 * Not modelled in the domain aggregate (pure operational concern). Left in Prisma
 * row; mapper ignores it.  The QRCodeService reads it directly from Prisma when
 * building labels.
 */
import type {
  Prisma,
  AssetStatus as PrismaAssetStatus,
  Criticality as PrismaCriticality,
} from '@prisma/client'
import { Asset, AssetId, AssetNumber, AssetStatus, CriticalityLevel } from '@maintainhub/domain'
import type { AssetDocument, AssetProps } from '@maintainhub/domain'

// ── Prisma row shapes ─────────────────────────────────────────────────────────

/** Full Prisma row with the documents (attachments) relation. */
export type PrismaAssetRow = Prisma.AssetGetPayload<{
  include: { attachments: true }
}>

/** Slim row without relations — for list queries. */
export type PrismaAssetRowSlim = Prisma.AssetGetPayload<{
  select: {
    id: true
    tenantId: true
    assetNumber: true
    name: true
    description: true
    categoryId: true
    parentId: true
    locationId: true
    criticality: true
    status: true
    manufacturer: true
    model: true
    serialNumber: true
    installDate: true
    warrantyExpiry: true
    customFields: true
    createdAt: true
    updatedAt: true
    deletedAt: true
  }
}>

// ── Mapper ────────────────────────────────────────────────────────────────────

export class AssetMapper {
  // ── Prisma → Domain ────────────────────────────────────────────────────────

  static toDomain(row: PrismaAssetRow): Asset {
    return Asset.reconstitute(AssetMapper.buildProps(row, row.attachments))
  }

  static toDomainSlim(row: PrismaAssetRowSlim): Asset {
    return Asset.reconstitute(AssetMapper.buildProps(row, []))
  }

  // ── Domain → Prisma ────────────────────────────────────────────────────────

  static toCreateInput(asset: Asset): Prisma.AssetUncheckedCreateInput {
    return {
      id: asset.id.value,
      tenantId: asset.tenantId,
      assetNumber: asset.assetNumber.value,
      name: asset.name,
      categoryId: asset.categoryId,
      status: asset.status.value as PrismaAssetStatus,
      criticality: asset.criticality.value as PrismaCriticality,
      installDate: asset.installDate,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      customFields: Object.fromEntries(asset.customFields) as Prisma.InputJsonValue,
      ...(asset.description !== undefined && { description: asset.description }),
      ...(asset.locationId !== undefined && { locationId: asset.locationId }),
      ...(asset.parentId !== undefined && { parentId: asset.parentId.value }),
      ...(asset.manufacturer !== undefined && { manufacturer: asset.manufacturer }),
      ...(asset.model !== undefined && { model: asset.model }),
      ...(asset.serialNumber !== undefined && { serialNumber: asset.serialNumber }),
      ...(asset.warrantyExpiry !== undefined && { warrantyExpiry: asset.warrantyExpiry }),
    }
  }

  static toUpdateInput(asset: Asset): Prisma.AssetUncheckedUpdateInput {
    return {
      name: asset.name,
      status: asset.status.value as PrismaAssetStatus,
      criticality: asset.criticality.value as PrismaCriticality,
      updatedAt: asset.updatedAt,
      customFields: Object.fromEntries(asset.customFields) as Prisma.InputJsonValue,
      description: asset.description ?? null,
      locationId: asset.locationId ?? null,
      parentId: asset.parentId?.value ?? null,
      manufacturer: asset.manufacturer ?? null,
      model: asset.model ?? null,
      serialNumber: asset.serialNumber ?? null,
      warrantyExpiry: asset.warrantyExpiry ?? null,
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static buildProps(
    row: PrismaAssetRowSlim,
    attachments: Prisma.AttachmentGetPayload<Record<string, never>>[],
  ): AssetProps {
    const customFields = new Map<string, unknown>(
      Object.entries(
        typeof row.customFields === 'object' && row.customFields !== null
          ? (row.customFields as Record<string, unknown>)
          : {},
      ),
    )

    const documents: AssetDocument[] = attachments.map((a) => ({
      id: a.id,
      title: a.fileName,
      storageKey: a.storageKey,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      uploadedById: a.uploadedById,
      uploadedAt: a.createdAt,
    }))

    // The Asset Prisma model has no createdById column (it was added to the
    // domain aggregate after the schema was locked).  We fall back to an empty
    // string so the aggregate can be reconstituted without a schema migration.
    // TODO: add `createdById String?` to the Asset model and backfill.
    const props: AssetProps = {
      id: new AssetId(row.id),
      tenantId: row.tenantId,
      assetNumber: new AssetNumber(row.assetNumber),
      categoryId: row.categoryId,
      installDate: row.installDate ?? row.createdAt,
      createdById: '', // schema debt — see TODO above
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      name: row.name,
      status: AssetStatus.from(row.status),
      criticality: CriticalityLevel.from(row.criticality),
      customFields,
      documents,
      ...(row.description !== null && { description: row.description }),
      ...(row.locationId !== null && { locationId: row.locationId }),
      ...(row.parentId !== null && { parentId: new AssetId(row.parentId) }),
      ...(row.manufacturer !== null && { manufacturer: row.manufacturer }),
      ...(row.model !== null && { model: row.model }),
      ...(row.serialNumber !== null && { serialNumber: row.serialNumber }),
      ...(row.warrantyExpiry !== null && { warrantyExpiry: row.warrantyExpiry }),
    }

    return props
  }
}
