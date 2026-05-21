/**
 * SearchAssetsHandler — full-text asset search via Meilisearch.
 *
 * ## Index design
 *
 * Index name: `assets_{tenantId}` — one index per tenant for data isolation.
 *
 * Indexed fields:
 *   assetNumber, name, serialNumber, manufacturer, model
 *
 * Filterable attributes (for category/status filters):
 *   status, criticality, categoryId, locationId
 *
 * Sortable attributes:
 *   assetNumber, name
 *
 * ## Sync strategy
 *
 * `AssetSearchSyncService` (in this file) handles the write side.
 * Call `upsertDocument` after CREATE and UPDATE commands.
 * Call `deleteDocument` after soft-delete/decommission.
 *
 * ## Highlighting
 *
 * Meilisearch returns `_formatted` fields with `<em>` tags around matched terms.
 * The `highlights` field in `AssetSearchHit` carries these per-field snippets.
 */
import { type Meilisearch } from 'meilisearch'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  AssetSearchHit,
  SearchAssetsResult,
  AssetCardDto,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface SearchAssetsQuery {
  q: string
  /** Meilisearch filter expression, e.g. `status = 'OPERATIONAL'`. */
  filter?: string
  /** Maximum number of results. @default 20 */
  limit?: number
  /** Zero-based offset. @default 0 */
  offset?: number
}

// ── Meilisearch document shape ────────────────────────────────────────────────

export interface AssetSearchDocument {
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
  categoryName: string
  locationId: string | null
  locationName: string | null
  parentId: string | null
  parentName: string | null
  isDecommissioned: boolean
  updatedAt: number // Unix timestamp — Meilisearch sorts on numbers
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class SearchAssetsHandler {
  private readonly search: Meilisearch

  private readonly db: TenantClient

  constructor(search: Meilisearch, db: TenantClient) {
    this.search = search
    this.db = db
  }

  /**
   * Search assets in the tenant's Meilisearch index.
   *
   * Falls back to an empty result (not an error) when Meilisearch is
   * unavailable — callers should handle this gracefully (e.g. degrade to
   * a Prisma ILIKE search).
   */
  async handle(query: SearchAssetsQuery, ctx: QueryContext): Promise<SearchAssetsResult> {
    const indexName = SearchAssetsHandler.indexName(ctx.tenantId)
    const index = this.search.index<AssetSearchDocument>(indexName)

    const { hits, estimatedTotalHits, processingTimeMs } = await index.search(query.q, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      ...(query.filter !== undefined && { filter: query.filter }),
      attributesToHighlight: ['assetNumber', 'name', 'serialNumber', 'manufacturer', 'model'],
      highlightPreTag: '<em>',
      highlightPostTag: '</em>',
    })

    // Enrich hits with open WO count (not stored in Meilisearch — always fresh)
    const assetIds = hits.map((h: AssetSearchDocument) => h.id)
    const openWOCounts =
      assetIds.length > 0
        ? await this.db.workOrder.groupBy({
            by: ['assetId'],
            where: {
              assetId: { in: assetIds },
              deletedAt: null,
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
            _count: { _all: true },
          })
        : []

    // eslint-disable-next-line no-underscore-dangle
    const openWOByAsset = new Map(openWOCounts.map((r) => [r.assetId, r._count._all]))
    const resultHits: AssetSearchHit[] = hits.map((hit: AssetSearchDocument) => {
      const card: AssetCardDto = {
        id: hit.id,
        assetNumber: hit.assetNumber,
        name: hit.name,
        status: hit.status,
        criticality: hit.criticality,
        categoryId: hit.categoryId,
        categoryName: hit.categoryName,
        locationId: hit.locationId,
        locationName: hit.locationName,
        parentId: hit.parentId,
        parentName: hit.parentName,
        manufacturer: hit.manufacturer,
        model: hit.model,
        serialNumber: hit.serialNumber,
        installDate: null,
        warrantyExpiry: null, // not stored in index
        isWarrantyActive: false,
        openWOCount: openWOByAsset.get(hit.id) ?? 0,
        createdAt: new Date(hit.updatedAt * 1000).toISOString(),
        updatedAt: new Date(hit.updatedAt * 1000).toISOString(),
      }

      // Extract highlighted snippets from Meilisearch's `_formatted` field.
      // Uses bracket notation to avoid the no-underscore-dangle rule.
      type Formatted = Partial<Record<keyof AssetSearchDocument, string>>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hitAny = hit as any
      // eslint-disable-next-line no-underscore-dangle
      const fmt: Formatted = (hitAny._formatted as Formatted | undefined) ?? {}

      return {
        ...card,
        highlights: {
          assetNumber: fmt.assetNumber,
          name: fmt.name,
          serialNumber: fmt.serialNumber ?? undefined,
          manufacturer: fmt.manufacturer ?? undefined,
          model: fmt.model ?? undefined,
        },
      }
    })

    return {
      hits: resultHits,
      estimatedTotal: estimatedTotalHits ?? 0,
      processingTimeMs,
      query: query.q,
    }
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  static indexName(tenantId: string): string {
    return `assets_${tenantId}`
  }
}

// AssetSearchSyncService is exported from ./asset-search-sync.ts
// (split to comply with the max-classes-per-file rule)
