/**
 * AssetSearchSyncService — write side of the Meilisearch integration.
 *
 * Call `upsertDocument` after creating or updating an asset.
 * Call `deleteDocument` when an asset is soft-deleted or decommissioned.
 *
 * Errors are swallowed — index sync failures are non-fatal.
 */
import { type Meilisearch } from 'meilisearch'
import { SearchAssetsHandler } from './search-assets.js'
import type { AssetSearchDocument } from './search-assets.js'

export { AssetSearchDocument }

export class AssetSearchSyncService {
  private readonly search: Meilisearch

  constructor(search: Meilisearch) {
    this.search = search
  }

  async upsertDocument(doc: AssetSearchDocument): Promise<void> {
    try {
      const index = this.search.index<AssetSearchDocument>(
        SearchAssetsHandler.indexName(doc.tenantId),
      )
      await index.addDocuments([doc], { primaryKey: 'id' })
    } catch {
      // Non-fatal — search index lag is acceptable
    }
  }

  async deleteDocument(assetId: string, tenantId: string): Promise<void> {
    try {
      const index = this.search.index<AssetSearchDocument>(SearchAssetsHandler.indexName(tenantId))
      await index.deleteDocument(assetId)
    } catch {
      // Non-fatal
    }
  }

  /**
   * Ensure the tenant's index is configured with the correct filterable and
   * sortable attributes.  Safe to call multiple times (idempotent).
   */
  async ensureIndex(tenantId: string): Promise<void> {
    try {
      const indexName = SearchAssetsHandler.indexName(tenantId)
      await this.search.createIndex(indexName, { primaryKey: 'id' })
      const index = this.search.index<AssetSearchDocument>(indexName)
      await index.updateFilterableAttributes([
        'status',
        'criticality',
        'categoryId',
        'locationId',
        'isDecommissioned',
      ])
      await index.updateSortableAttributes(['assetNumber', 'name', 'updatedAt'])
      await index.updateSearchableAttributes([
        'assetNumber',
        'name',
        'serialNumber',
        'manufacturer',
        'model',
      ])
    } catch {
      // Non-fatal — index may already be configured
    }
  }

  /** Build an `AssetSearchDocument` from a Prisma row. */
  static buildDocument(row: {
    id: string
    tenantId: string
    assetNumber: string
    name: string
    serialNumber: string | null
    manufacturer: string | null
    model: string | null
    status: string
    criticality: string
    categoryId: string
    category: { name: string }
    locationId: string | null
    location: { name: string } | null
    parentId: string | null
    parent: { name: string } | null
    updatedAt: Date
  }): AssetSearchDocument {
    return {
      id: row.id,
      tenantId: row.tenantId,
      assetNumber: row.assetNumber,
      name: row.name,
      serialNumber: row.serialNumber,
      manufacturer: row.manufacturer,
      model: row.model,
      status: row.status,
      criticality: row.criticality,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      locationId: row.locationId,
      locationName: row.location?.name ?? null,
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
      isDecommissioned: row.status === 'DECOMMISSIONED',
      updatedAt: Math.floor(row.updatedAt.getTime() / 1000),
    }
  }
}
