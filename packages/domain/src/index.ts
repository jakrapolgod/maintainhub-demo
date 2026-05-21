// ── Errors ────────────────────────────────────────────────────────────────────
export { DomainException } from './errors/domain.exception.js'

// ── Domain events (base) ──────────────────────────────────────────────────────
export { DomainEvent } from './events/domain-event.js'
export { BaseDomainEvent } from './events/base-domain-event.js'

// ── Work Order value objects ──────────────────────────────────────────────────
export {
  Money,
  WorkOrderId,
  Priority,
  WorkOrderStatus,
  LaborCost,
  PermitToWork,
} from './work-orders/value-objects/index.js'
export type { PriorityLevel, StatusValue } from './work-orders/value-objects/index.js'

// ── Work Order supporting types ───────────────────────────────────────────────
export type { WOType, LaborEntry, PartUsage, Attachment } from './work-orders/work-order.types.js'

// ── Work Order domain events ──────────────────────────────────────────────────
export {
  WorkOrderCreatedEvent,
  WorkOrderAssignedEvent,
  WorkOrderCompletedEvent,
  WorkOrderCancelledEvent,
  WorkOrderEscalatedEvent,
  SLABreachedEvent,
} from './work-orders/events/index.js'

// ── Work Order aggregate ──────────────────────────────────────────────────────
export { WorkOrder } from './work-orders/WorkOrder.js'
export type { WorkOrderProps } from './work-orders/WorkOrder.js'

// ── Work Order repository (Port) ──────────────────────────────────────────────
export type { WorkOrderRepository, WOFilters } from './work-orders/WorkOrderRepository.js'

// ── Asset value objects ───────────────────────────────────────────────────────
export {
  AssetId,
  AssetNumber,
  AssetCategory,
  AssetStatus,
  CriticalityLevel,
} from './assets/value-objects/index.js'
export type { AssetStatusValue, CriticalityValue } from './assets/value-objects/index.js'

// ── Asset domain events ───────────────────────────────────────────────────────
export {
  AssetCreatedEvent,
  AssetStatusChangedEvent,
  AssetDecommissionedEvent,
  AssetTransferredEvent,
} from './assets/events/index.js'

// ── Asset aggregate ───────────────────────────────────────────────────────────
export { Asset, MAX_ASSET_DEPTH } from './assets/Asset.js'
export type { AssetProps, AssetDocument } from './assets/Asset.js'

// ── Asset repository (Port) ───────────────────────────────────────────────────
export type { AssetRepository, AssetFilters } from './assets/AssetRepository.js'

// ── Asset domain services ─────────────────────────────────────────────────────
export { AssetMetricsService } from './assets/AssetMetricsService.js'
export type { Duration, CriticalityFactors, ImpactLevel } from './assets/AssetMetricsService.js'

// ── PM Schedule value objects ─────────────────────────────────────────────────
export { PMScheduleId } from './pm-schedules/value-objects/pm-schedule-id.js'
export { CalendarRule } from './pm-schedules/value-objects/calendar-rule.js'
export type { CalendarRuleProps, Frequency } from './pm-schedules/value-objects/calendar-rule.js'
export { MeterRule } from './pm-schedules/value-objects/meter-rule.js'
export { Task } from './pm-schedules/value-objects/task.js'
export type { TaskProps } from './pm-schedules/value-objects/task.js'
export { RequiredPart } from './pm-schedules/value-objects/required-part.js'

// ── PM Schedule domain events ─────────────────────────────────────────────────
export { PMTriggeredEvent } from './pm-schedules/events/pm-triggered.event.js'
export type { TriggerSource } from './pm-schedules/events/pm-triggered.event.js'
export { PMScheduleActivatedEvent } from './pm-schedules/events/pm-schedule-activated.event.js'
export { PMScheduleDeactivatedEvent } from './pm-schedules/events/pm-schedule-deactivated.event.js'

// ── PM Schedule aggregate ─────────────────────────────────────────────────────
export { PMSchedule } from './pm-schedules/PMSchedule.js'
export type { PMScheduleProps, PMType, WorkOrderDraft } from './pm-schedules/PMSchedule.js'

// ── PM Schedule repository (Port) ─────────────────────────────────────────────
export type { PMScheduleRepository } from './pm-schedules/PMScheduleRepository.js'

// ── Integration value objects ─────────────────────────────────────────────────
export { WebhookEndpointId } from './integrations/value-objects/webhook-endpoint-id.js'
export { WebhookDeliveryId } from './integrations/value-objects/webhook-delivery-id.js'
export { IntegrationId } from './integrations/value-objects/integration-id.js'
export {
  ALL_WEBHOOK_EVENT_TYPES,
  isWebhookEventType,
} from './integrations/value-objects/webhook-event-type.js'
export type { WebhookEventType } from './integrations/value-objects/webhook-event-type.js'

// ── Integration domain events ─────────────────────────────────────────────────
export { WebhookEndpointActivatedEvent } from './integrations/events/webhook-endpoint-activated.event.js'
export { WebhookEndpointDeactivatedEvent } from './integrations/events/webhook-endpoint-deactivated.event.js'
export { WebhookDeliveryRequestedEvent } from './integrations/events/webhook-delivery-requested.event.js'

// ── Integration aggregates / entities ────────────────────────────────────────
export { WebhookEndpoint } from './integrations/WebhookEndpoint.js'
export type { WebhookEndpointProps } from './integrations/WebhookEndpoint.js'
export { WebhookDelivery, MAX_DELIVERY_ATTEMPTS } from './integrations/WebhookDelivery.js'
export type { WebhookDeliveryProps, DeliveryStatus } from './integrations/WebhookDelivery.js'
export { Integration, ALL_INTEGRATION_PROVIDERS } from './integrations/Integration.js'
export type { IntegrationProps, IntegrationProvider } from './integrations/Integration.js'

// ── Integration repository ports ──────────────────────────────────────────────
export type { WebhookEndpointRepository } from './integrations/WebhookEndpointRepository.js'
export type { WebhookDeliveryRepository } from './integrations/WebhookDeliveryRepository.js'
export type { IntegrationRepository } from './integrations/IntegrationRepository.js'
