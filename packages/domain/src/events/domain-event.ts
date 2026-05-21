/**
 * Base class for all domain events.
 *
 * A domain event records that something meaningful happened inside an aggregate.
 * Events are immutable facts — they describe the past, never a command.
 *
 * Consumers (application services, projections, other bounded contexts) react to
 * events after they are pulled from the aggregate via `pullEvents()`.
 */
export abstract class DomainEvent {
  /** The string discriminant used by event handlers and serialisers. */
  abstract readonly eventType: string

  /** The ID of the aggregate that raised this event. */
  readonly aggregateId: string

  /** Wall-clock time at which the event was raised. */
  readonly occurredAt: Date

  constructor(aggregateId: string) {
    this.aggregateId = aggregateId
    this.occurredAt = new Date()
  }
}
