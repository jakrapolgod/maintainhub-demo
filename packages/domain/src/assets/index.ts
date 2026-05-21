// ── Value objects ──────────────────────────────────────────────────────────────
export {
  AssetId,
  AssetNumber,
  AssetCategory,
  AssetStatus,
  CriticalityLevel,
} from './value-objects/index.js'
export type { AssetStatusValue, CriticalityValue } from './value-objects/index.js'

// ── Domain events ──────────────────────────────────────────────────────────────
export {
  AssetCreatedEvent,
  AssetStatusChangedEvent,
  AssetDecommissionedEvent,
  AssetTransferredEvent,
} from './events/index.js'

// ── Aggregate ──────────────────────────────────────────────────────────────────
export { Asset, MAX_ASSET_DEPTH } from './Asset.js'
export type { AssetProps, AssetDocument } from './Asset.js'

// ── Repository (Port) ──────────────────────────────────────────────────────────
export type { AssetRepository, AssetFilters } from './AssetRepository.js'

// ── Domain services ────────────────────────────────────────────────────────────
export { AssetMetricsService } from './AssetMetricsService.js'
export type { Duration, CriticalityFactors, ImpactLevel } from './AssetMetricsService.js'
