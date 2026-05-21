import type { Integration, IntegrationProvider } from './Integration.js'
import type { IntegrationId } from './value-objects/integration-id.js'

/**
 * Port for Integration persistence.
 * Implementations live in the infrastructure layer.
 */
export interface IntegrationRepository {
  save(integration: Integration): Promise<void>

  update(integration: Integration): Promise<void>

  findById(id: IntegrationId, tenantId: string): Promise<Integration | undefined>

  delete(id: IntegrationId, tenantId: string): Promise<void>

  /** All integrations for a tenant. */
  findByTenant(tenantId: string): Promise<Integration[]>

  /** Find a specific provider integration for a tenant (at most one per provider). */
  findByProvider(provider: IntegrationProvider, tenantId: string): Promise<Integration | undefined>
}
