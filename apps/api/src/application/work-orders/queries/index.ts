// ── Shared types ───────────────────────────────────────────────────────────────
export type {
  QueryContext,
  UserStub,
  LaborEntryDto,
  PartUsageDto,
  AttachmentDto,
  CommentDto,
  AuditEntryDto,
  WorkOrderDetail,
  SortField,
  WorkOrderSummary,
  ListWorkOrdersResult,
  WorkOrderMetrics,
  AssetReliabilityRow,
  MonthlySeriesPoint,
  VolumeByTypePoint,
  AssetReliabilityResult,
  CostMix,
  MonthlyCostByCategory,
  CostBreakdownResult,
  CalendarWorkOrder,
  PMDueEntry,
  CalendarDayEntry,
  WorkOrderCalendar,
} from './query.types.js'

export {
  listCacheKey,
  listCachePattern,
  invalidateListCache,
  cacheGet,
  cacheSet,
  hashParams,
  LIST_TTL_SECONDS,
} from './query.types.js'

// ── Query + Handler pairs ──────────────────────────────────────────────────────
export type { GetWorkOrderQuery } from './get-work-order.js'
export { GetWorkOrderHandler } from './get-work-order.js'

export type { ListWorkOrdersQuery } from './list-work-orders.js'
export { ListWorkOrdersHandler } from './list-work-orders.js'

export type { GetWorkOrderMetricsQuery } from './get-work-order-metrics.js'
export { GetWorkOrderMetricsHandler } from './get-work-order-metrics.js'

export type { GetWorkOrderCalendarQuery } from './get-work-order-calendar.js'
export { GetWorkOrderCalendarHandler } from './get-work-order-calendar.js'

export type { GetAssetReliabilityQuery } from './get-asset-reliability.js'
export { GetAssetReliabilityHandler } from './get-asset-reliability.js'

export type { GetCostBreakdownQuery } from './get-cost-breakdown.js'
export { GetCostBreakdownHandler } from './get-cost-breakdown.js'
