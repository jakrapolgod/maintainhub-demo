/**
 * Integration — Entity representing an external system connection.
 *
 * Stores the provider type and (encrypted) configuration blob needed to
 * authenticate with the external system.  The `config` field is treated as
 * an opaque object at the domain layer — encryption/decryption is the
 * responsibility of the infrastructure layer.
 *
 * ## Supported providers
 *
 * | Provider         | Use case                                         |
 * |------------------|--------------------------------------------------|
 * | zapier           | No-code automation (trigger Zaps from WO events) |
 * | make             | Make.com (formerly Integromat) scenario triggers |
 * | slack            | Notifications to Slack channels / DMs            |
 * | google_workspace | Google Calendar PM events, Drive report exports  |
 * | azure_ad         | Azure Active Directory SSO / user provisioning   |
 */
import { DomainException } from '../errors/domain.exception.js'
import type { IntegrationId } from './value-objects/integration-id.js'

// ── Provider discriminant ──────────────────────────────────────────────────────

export type IntegrationProvider = 'zapier' | 'make' | 'slack' | 'google_workspace' | 'azure_ad'

export const ALL_INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = [
  'zapier',
  'make',
  'slack',
  'google_workspace',
  'azure_ad',
] as const

// ── Construction props ─────────────────────────────────────────────────────────

export interface IntegrationProps {
  id: IntegrationId
  tenantId: string
  provider: IntegrationProvider
  /** Opaque config blob — encrypted at rest by the infrastructure layer. */
  config: Record<string, unknown>
  isActive: boolean
  lastSyncAt: Date | undefined
  createdById: string
  createdAt: Date
  updatedAt: Date
}

// ── Entity ─────────────────────────────────────────────────────────────────────

export class Integration {
  // ── Identity (immutable) ────────────────────────────────────────────────────
  readonly id: IntegrationId

  readonly tenantId: string

  readonly provider: IntegrationProvider

  readonly createdById: string

  readonly createdAt: Date

  // ── Mutable state ───────────────────────────────────────────────────────────
  private mConfig: Record<string, unknown>

  private mIsActive: boolean

  private mLastSyncAt: Date | undefined

  private mUpdatedAt: Date

  private constructor(props: IntegrationProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.provider = props.provider
    this.createdById = props.createdById
    this.createdAt = props.createdAt
    this.mConfig = { ...props.config }
    this.mIsActive = props.isActive
    this.mLastSyncAt = props.lastSyncAt
    this.mUpdatedAt = props.updatedAt
  }

  // ── Factories ───────────────────────────────────────────────────────────────

  static create(
    props: Omit<IntegrationProps, 'isActive' | 'lastSyncAt' | 'createdAt' | 'updatedAt'>,
  ): Integration {
    Integration.validateProvider(props.provider)
    const now = new Date()
    return new Integration({
      ...props,
      isActive: false,
      lastSyncAt: undefined,
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: IntegrationProps): Integration {
    return new Integration(props)
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get config(): Record<string, unknown> {
    return { ...this.mConfig }
  }

  get isActive(): boolean {
    return this.mIsActive
  }

  get lastSyncAt(): Date | undefined {
    return this.mLastSyncAt
  }

  get updatedAt(): Date {
    return this.mUpdatedAt
  }

  // ── Business methods ────────────────────────────────────────────────────────

  activate(): void {
    if (this.mIsActive) {
      throw new DomainException('Integration is already active', 'INTEGRATION_ALREADY_ACTIVE')
    }
    this.mIsActive = true
    this.mUpdatedAt = new Date()
  }

  deactivate(): void {
    if (!this.mIsActive) {
      throw new DomainException('Integration is already inactive', 'INTEGRATION_ALREADY_INACTIVE')
    }
    this.mIsActive = false
    this.mUpdatedAt = new Date()
  }

  /** Replace the configuration blob (encrypted by the caller before passing). */
  updateConfig(config: Record<string, unknown>): void {
    this.mConfig = { ...config }
    this.mUpdatedAt = new Date()
  }

  /** Record that a synchronisation with the external system has completed. */
  recordSync(): void {
    this.mLastSyncAt = new Date()
    this.mUpdatedAt = new Date()
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private static validateProvider(provider: IntegrationProvider): void {
    if (!(ALL_INTEGRATION_PROVIDERS as readonly string[]).includes(provider)) {
      throw new DomainException(
        `Unknown integration provider: "${provider}"`,
        'INVALID_INTEGRATION_PROVIDER',
      )
    }
  }
}
