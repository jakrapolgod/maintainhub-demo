// ── Shared types ───────────────────────────────────────────────────────────────
export type {
  QueryContext,
  AssetStub,
  AssetCardDto,
  AssetDetail,
  WorkOrderSummaryDto,
  PMScheduleSummaryDto,
  AssetDocumentDto,
  AssetMetricsSummary,
  AssetTreeNode,
  AssetFlatNode,
  AssetTreeResult,
  MonthlyMttrPoint,
  AssetMetricsDetail,
  AssetSearchHit,
  SearchAssetsResult,
  AssetsByLocationGroup,
  AssetsByLocationResult,
  AttentionReason,
  AssetAttentionItem,
  AssetsNeedingAttentionResult,
} from './query.types.js'

// ── Query + Handler pairs ──────────────────────────────────────────────────────

export type { GetAssetQuery } from './get-asset.js'
export { GetAssetHandler } from './get-asset.js'

export type { GetAssetTreeQuery } from './get-asset-tree.js'
export { GetAssetTreeHandler } from './get-asset-tree.js'

export type { GetAssetMetricsQuery } from './get-asset-metrics.js'
export { GetAssetMetricsHandler } from './get-asset-metrics.js'

export type { SearchAssetsQuery } from './search-assets.js'
export { SearchAssetsHandler } from './search-assets.js'
export type { AssetSearchDocument } from './search-assets.js'

export { AssetSearchSyncService } from './asset-search-sync.js'

export type { GetAssetsByLocationQuery } from './get-assets-by-location.js'
export { GetAssetsByLocationHandler } from './get-assets-by-location.js'

export type { GetAssetsNeedingAttentionQuery } from './get-assets-needing-attention.js'
export { GetAssetsNeedingAttentionHandler } from './get-assets-needing-attention.js'
