import { randomUUID } from 'node:crypto'
import { DomainEvent } from './domain-event.js'

/**
 * Richer base for domain events that carries an event-level identity and the
 * aggregate type, enabling idempotent processing, dead-letter recovery, and
 * cross-context event routing.
 *
 * Extends the lightweight `DomainEvent` so new events remain fully compatible
 * with `WorkOrder.domainEvents: DomainEvent[]` and the existing infrastructure
 * that dispatches those events.
 *
 * ## Fields (all readonly — events are immutable facts)
 *
 * | Field           | Type   | Purpose                                           |
 * |-----------------|--------|---------------------------------------------------|
 * | `eventId`       | string | UUID v4 — unique across all events, all types     |
 * | `occurredAt`    | Date   | Wall-clock time the event was raised (inherited)  |
 * | `aggregateId`   | string | ID of the aggregate that raised the event         |
 * | `aggregateType` | string | Human-readable type tag, e.g. `'WorkOrder'`       |
 * | `eventType`     | string | Discriminant, e.g. `'WorkOrderCreated'` (abstract)|
 */
export abstract class BaseDomainEvent extends DomainEvent {
  /**
   * Universally unique identifier for this specific event instance.
   * Generated once at construction using `crypto.randomUUID()`.
   * Use it for idempotency checks, deduplication, and tracing.
   */
  readonly eventId: string

  /**
   * Type name of the aggregate that owns this event.
   * Used by event routers and projections to quickly identify the context
   * without inspecting the full payload or the `eventType` discriminant.
   */
  readonly aggregateType: string

  constructor(aggregateId: string, aggregateType: string) {
    super(aggregateId) // sets aggregateId and occurredAt
    this.eventId = randomUUID()
    this.aggregateType = aggregateType
  }
}
