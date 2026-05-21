/**
 * Asset — Domain Aggregate Root.
 *
 * An Asset represents a physical or virtual facility component (pump, motor,
 * conveyor, HVAC unit, software system, etc.) that is tracked for maintenance.
 *
 * ## Hierarchy
 *
 * Assets can form a tree up to 5 levels deep (Plant → Building → System →
 * Equipment → Component).  The domain enforces:
 *   - Max depth of 5 levels (1 = root, 5 = leaf).
 *   - No circular references (an asset cannot be its own ancestor).
 *
 * ## Decommissioning
 *
 * Decommissioning is a domain action — the caller must first verify that no
 * open work orders exist via `AssetRepository.hasOpenWorkOrders()`.  The
 * `decommission()` method accepts a `hasOpenWOs` flag (pre-computed by the
 * command handler) to avoid coupling the aggregate to the repository.
 *
 * ## Documents
 *
 * `AssetDocument` entries (manuals, drawings, certificates) are embedded
 * within the aggregate and managed here, but their binary content lives in
 * MinIO; only the reference (storageKey + metadata) is stored here.
 */
import { DomainException } from '../errors/domain.exception.js'
import type { DomainEvent } from '../events/domain-event.js'
import { type AssetId } from './value-objects/asset-id.js'
import { type AssetNumber } from './value-objects/asset-number.js'
import { AssetStatus } from './value-objects/asset-status.js'
import { type CriticalityLevel } from './value-objects/criticality-level.js'
import { AssetCreatedEvent } from './events/asset-created.event.js'
import { AssetStatusChangedEvent } from './events/asset-status-changed.event.js'
import { AssetDecommissionedEvent } from './events/asset-decommissioned.event.js'
import { AssetTransferredEvent } from './events/asset-transferred.event.js'

// ── Maximum hierarchy depth ───────────────────────────────────────────────────

export const MAX_ASSET_DEPTH = 5

// ── Supporting types ──────────────────────────────────────────────────────────

export interface AssetDocument {
  id: string
  title: string
  storageKey: string
  mimeType: string
  fileSize: number
  uploadedById: string
  uploadedAt: Date
}

// ── Mutable state ─────────────────────────────────────────────────────────────

interface MutableState {
  status: AssetStatus
  criticality: CriticalityLevel
  name: string
  description: string | undefined
  locationId: string | undefined
  manufacturer: string | undefined
  model: string | undefined
  serialNumber: string | undefined
  warrantyExpiry: Date | undefined
  customFields: Map<string, unknown>
  documents: AssetDocument[]
  parentId: AssetId | undefined
  updatedAt: Date
}

// ── Construction props ────────────────────────────────────────────────────────

export interface AssetProps {
  id: AssetId
  tenantId: string
  assetNumber: AssetNumber
  categoryId: string
  installDate: Date
  createdById: string
  createdAt: Date
  updatedAt: Date
  // Mutable fields
  name: string
  status: AssetStatus
  criticality: CriticalityLevel
  description?: string
  locationId?: string
  parentId?: AssetId
  manufacturer?: string
  model?: string
  serialNumber?: string
  warrantyExpiry?: Date
  customFields?: Map<string, unknown>
  documents?: AssetDocument[]
}

// ── Aggregate root ────────────────────────────────────────────────────────────

export class Asset {
  // ── Immutable identity fields ───────────────────────────────────────────────
  readonly id: AssetId

  readonly tenantId: string

  readonly assetNumber: AssetNumber

  readonly categoryId: string

  readonly installDate: Date

  readonly createdById: string

  readonly createdAt: Date

  // ── Mutable state (private — exposed through accessors) ────────────────────
  private state: MutableState

  // ── Domain event buffer ─────────────────────────────────────────────────────
  private domainEvents: DomainEvent[]

  private constructor(props: AssetProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.assetNumber = props.assetNumber
    this.categoryId = props.categoryId
    this.installDate = props.installDate
    this.createdById = props.createdById
    this.createdAt = props.createdAt
    this.domainEvents = []

    this.state = {
      status: props.status,
      criticality: props.criticality,
      name: props.name,
      description: props.description,
      locationId: props.locationId,
      parentId: props.parentId,
      manufacturer: props.manufacturer,
      model: props.model,
      serialNumber: props.serialNumber,
      warrantyExpiry: props.warrantyExpiry,
      customFields: props.customFields ?? new Map(),
      documents: [...(props.documents ?? [])],
      updatedAt: props.updatedAt,
    }
  }

  // ── Accessors (read-only projections of mutable state) ────────────────────

  get status(): AssetStatus {
    return this.state.status
  }

  get criticality(): CriticalityLevel {
    return this.state.criticality
  }

  get name(): string {
    return this.state.name
  }

  get description(): string | undefined {
    return this.state.description
  }

  get locationId(): string | undefined {
    return this.state.locationId
  }

  get parentId(): AssetId | undefined {
    return this.state.parentId
  }

  get manufacturer(): string | undefined {
    return this.state.manufacturer
  }

  get model(): string | undefined {
    return this.state.model
  }

  get serialNumber(): string | undefined {
    return this.state.serialNumber
  }

  get warrantyExpiry(): Date | undefined {
    return this.state.warrantyExpiry
  }

  get customFields(): ReadonlyMap<string, unknown> {
    return this.state.customFields
  }

  get documents(): readonly AssetDocument[] {
    return this.state.documents
  }

  get updatedAt(): Date {
    return this.state.updatedAt
  }

  // ── Factory: create new asset ─────────────────────────────────────────────

  /**
   * Register a new asset — starts in OPERATIONAL status and emits
   * `AssetCreatedEvent`.
   */
  static create(props: {
    id: AssetId
    tenantId: string
    assetNumber: AssetNumber
    name: string
    categoryId: string
    criticality: CriticalityLevel
    installDate: Date
    createdById: string
    description?: string
    locationId?: string
    parentId?: AssetId
    manufacturer?: string
    model?: string
    serialNumber?: string
    warrantyExpiry?: Date
    customFields?: Map<string, unknown>
  }): Asset {
    if (!props.name.trim()) {
      throw new DomainException('Asset name must not be empty', 'INVALID_ASSET_NAME')
    }
    if (!props.categoryId.trim()) {
      throw new DomainException('Asset categoryId must not be empty', 'INVALID_CATEGORY_ID')
    }

    const now = new Date()
    const asset = new Asset({
      ...props,
      status: AssetStatus.OPERATIONAL,
      createdAt: now,
      updatedAt: now,
    })

    asset.domainEvents.push(
      new AssetCreatedEvent({
        aggregateId: props.id.value,
        tenantId: props.tenantId,
        assetNumber: props.assetNumber.value,
        name: props.name.trim(),
        categoryId: props.categoryId,
        criticality: props.criticality.value,
        createdById: props.createdById,
      }),
    )

    return asset
  }

  // ── Factory: reconstitute from persistence ────────────────────────────────

  /**
   * Rebuild the aggregate from a persisted row — no events are raised.
   * Used by repository implementations after loading from DB.
   */
  static reconstitute(props: AssetProps): Asset {
    return new Asset(props)
  }

  // ── Domain behaviour ──────────────────────────────────────────────────────

  /**
   * Transition to a new status.
   * Delegates to `AssetStatus.transitionTo()` which throws on invalid paths.
   *
   * @throws DomainException INVALID_ASSET_STATUS_TRANSITION
   */
  changeStatus(newStatus: AssetStatus, changedBy: string): void {
    const previous = this.state.status
    this.state.status = previous.transitionTo(newStatus)
    this.state.updatedAt = new Date()

    this.domainEvents.push(
      new AssetStatusChangedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetNumber: this.assetNumber.value,
        previousStatus: previous.value,
        newStatus: newStatus.value,
        changedBy,
      }),
    )
  }

  /**
   * Permanently decommission this asset.
   *
   * The command handler MUST check `AssetRepository.hasOpenWorkOrders()` and
   * pass the result as `hasOpenWOs` to keep the aggregate free of repository
   * dependencies.
   *
   * @param hasOpenWOs - Pass `true` if open work orders exist → throws
   * @throws DomainException OPEN_WORK_ORDERS_EXIST
   * @throws DomainException ALREADY_DECOMMISSIONED
   */
  decommission(reason: string, authorizedBy: string, hasOpenWOs: boolean): void {
    if (this.state.status.isDecommissioned()) {
      throw new DomainException(
        `Asset ${this.assetNumber.value} is already decommissioned`,
        'ALREADY_DECOMMISSIONED',
      )
    }
    if (hasOpenWOs) {
      throw new DomainException(
        `Asset ${this.assetNumber.value} has open work orders — resolve or cancel them before decommissioning`,
        'OPEN_WORK_ORDERS_EXIST',
      )
    }
    if (!reason.trim()) {
      throw new DomainException(
        'Decommission reason must not be empty',
        'DECOMMISSION_REASON_REQUIRED',
      )
    }

    this.state.status = AssetStatus.DECOMMISSIONED
    this.state.updatedAt = new Date()

    this.domainEvents.push(
      new AssetDecommissionedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetNumber: this.assetNumber.value,
        reason: reason.trim(),
        authorizedBy,
      }),
    )
  }

  /**
   * Transfer the asset to a different physical location.
   *
   * @throws DomainException DECOMMISSIONED_ASSET — cannot move a decommissioned asset
   */
  transferLocation(newLocationId: string, transferredBy: string): void {
    if (this.state.status.isDecommissioned()) {
      throw new DomainException(
        `Cannot transfer decommissioned asset ${this.assetNumber.value}`,
        'DECOMMISSIONED_ASSET',
      )
    }
    if (!newLocationId.trim()) {
      throw new DomainException('New location ID must not be empty', 'INVALID_LOCATION_ID')
    }

    const previous = this.state.locationId
    this.state.locationId = newLocationId.trim()
    this.state.updatedAt = new Date()

    this.domainEvents.push(
      new AssetTransferredEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetNumber: this.assetNumber.value,
        ...(previous !== undefined && { previousLocationId: previous }),
        newLocationId: newLocationId.trim(),
        transferredBy,
      }),
    )
  }

  /**
   * Set or clear the parent asset in the hierarchy.
   *
   * Validations:
   *   1. An asset cannot be its own parent (circular reference — self-loop).
   *   2. Cycle detection: `ancestorIds` must not include this asset's id.
   *      The caller fetches ancestors via `AssetRepository.findAncestors()`.
   *   3. Resulting depth must not exceed MAX_ASSET_DEPTH (5).
   *      `parentDepth` = the parent's current depth level (1 = root).
   *
   * @param parentId     The new parent's AssetId, or undefined to make this a root.
   * @param ancestorIds  Full list of the intended parent's ancestor IDs (leaf→root),
   *                     used for cycle detection.  Pass [] when parentId is undefined.
   * @param parentDepth  Current depth level of the intended parent (1 = root).
   *                     Ignored when parentId is undefined.
   *
   * @throws DomainException CIRCULAR_REFERENCE
   * @throws DomainException MAX_ASSET_DEPTH_EXCEEDED
   */
  setParent(parentId: AssetId | undefined, ancestorIds: string[], parentDepth: number): void {
    if (parentId === undefined) {
      this.state.parentId = undefined
      this.state.updatedAt = new Date()
      return
    }

    // 1. Self-loop guard
    if (parentId.equals(this.id)) {
      throw new DomainException(
        `Asset ${this.assetNumber.value} cannot be its own parent`,
        'CIRCULAR_REFERENCE',
      )
    }

    // 2. Cycle guard: this asset must not appear in the ancestor chain
    if (ancestorIds.includes(this.id.value)) {
      throw new DomainException(
        `Setting parent would create a circular reference in the asset hierarchy`,
        'CIRCULAR_REFERENCE',
      )
    }

    // 3. Depth guard: resulting level = parentDepth + 1
    if (parentDepth + 1 > MAX_ASSET_DEPTH) {
      throw new DomainException(
        `Asset hierarchy depth cannot exceed ${MAX_ASSET_DEPTH} levels. ` +
          `Parent is already at level ${parentDepth}.`,
        'MAX_ASSET_DEPTH_EXCEEDED',
      )
    }

    this.state.parentId = parentId
    this.state.updatedAt = new Date()
  }

  /**
   * True when today is before the warranty expiry date.
   * Returns false when no warranty date is set.
   */
  isWarrantyActive(): boolean {
    if (!this.state.warrantyExpiry) return false
    return new Date() < this.state.warrantyExpiry
  }

  /**
   * Append a document reference to the asset's document collection.
   * Documents with duplicate `storageKey` values are silently deduplicated.
   */
  addDocument(doc: AssetDocument): void {
    if (!doc.storageKey.trim()) {
      throw new DomainException('Document storageKey must not be empty', 'INVALID_DOCUMENT')
    }
    const alreadyExists = this.state.documents.some((d) => d.storageKey === doc.storageKey)
    if (!alreadyExists) {
      this.state.documents = [...this.state.documents, doc]
      this.state.updatedAt = new Date()
    }
  }

  /**
   * Compute the current depth of this asset in the hierarchy.
   *
   * This method only uses the aggregate's own `parentId` field, which tells us
   * whether the asset has a parent.  For the full numeric depth (1–5), the
   * caller should use `AssetRepository.findAncestors()` and count the levels.
   *
   * Returns: 1 when the asset is a root (no parent), 2+ when it has a parent.
   * The exact level beyond 1 requires the repository to walk the tree.
   */
  getDepthLevel(): 1 | 2 {
    return this.state.parentId === undefined ? 1 : 2
  }

  // ── Domain event management ────────────────────────────────────────────────

  /**
   * Drain the event buffer — returns all queued events and clears the buffer.
   * Called by the repository after a successful DB write.
   */
  pullEvents(): DomainEvent[] {
    const events = [...this.domainEvents]
    this.domainEvents = []
    return events
  }
}
