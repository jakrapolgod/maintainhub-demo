/**
 * SyncUsersFromLDAPUseCase
 *
 * Nightly job that synchronises users from an LDAP / Active Directory server
 * to MaintainHub.
 *
 * ## Package requirement
 *   npm install ldapjs
 *   npm install --save-dev @types/ldapjs
 *
 * ## Flow
 *
 *   1. Load the tenant's Integration config (provider = 'azure_ad' or future 'ldap').
 *   2. Connect to the LDAP server using the stored credentials.
 *   3. Search for users matching the configured filter and OU.
 *   4. For each LDAP user:
 *      a. Map LDAP attributes to MaintainHub user fields.
 *      b. Create the user if not found (email match).
 *      c. Update name/role if changed.
 *      d. Deactivate if no longer in the LDAP result set.
 *   5. Record sync timestamp on the Integration entity.
 *   6. Return a summary: created, updated, deactivated, errors.
 *
 * ## Attribute mapping (configurable per tenant in Integration.config)
 *   {
 *     ldapUrl:        "ldap://dc.example.com:389",
 *     bindDn:         "CN=SvcAccount,OU=ServiceAccounts,DC=example,DC=com",
 *     bindPassword:   "<encrypted>",
 *     searchBase:     "OU=Users,DC=example,DC=com",
 *     searchFilter:   "(objectClass=user)",
 *     attributes: {
 *       email:        "mail",
 *       name:         "displayName",
 *       role:         "extensionAttribute1",   // optional: maps to MaintainHub role
 *     },
 *     roleMap: {
 *       "MaintainHub-Admin":      "ADMIN",
 *       "MaintainHub-Manager":    "MANAGER",
 *       "MaintainHub-Technician": "TECHNICIAN",
 *     }
 *   }
 */

import type { Role, PrismaClient } from '@prisma/client'
import type { IntegrationRepository } from '@maintainhub/domain'
import { DomainException } from '../../errors/domain.exception.js'
import { decryptConfig } from './commands/connect-integration.js'

// ── Dependency: ldapjs (lazy require) ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LdapClient = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LdapEntry = { objectName: string; attributes: Array<{ type: string; vals: string[] }> }

async function requireLdapJs(): Promise<{ createClient: (opts: object) => LdapClient }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, global-require
    return require('ldapjs')
  } catch {
    throw new DomainException(
      'LDAP sync requires ldapjs. Run: npm install ldapjs',
      'LDAP_PACKAGE_MISSING',
    )
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LdapSyncConfig {
  ldapUrl: string
  bindDn: string
  bindPassword: string
  searchBase: string
  searchFilter: string
  attributes: {
    email: string
    name: string
    role?: string
  }
  roleMap?: Record<string, 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER'>
}

export interface LdapSyncResult {
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: Array<{ email: string; message: string }>
}

// ── Use case ───────────────────────────────────────────────────────────────────

export class SyncUsersFromLDAPUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integRepo: IntegrationRepository,
  ) {}

  async execute(tenantId: string): Promise<LdapSyncResult> {
    // ── 1. Load integration config ────────────────────────────────────────────
    const integration = await this.integRepo.findByProvider('azure_ad', tenantId)
    if (integration === undefined || !integration.isActive) {
      throw new DomainException(
        'No active LDAP/Azure AD integration configured for this tenant',
        'LDAP_INTEGRATION_NOT_FOUND',
        404,
      )
    }

    const encryptedConfig = integration.config
    const { encryptedData } = encryptedConfig
    if (typeof encryptedData !== 'string') {
      throw new DomainException('Invalid integration config format', 'INVALID_INTEGRATION_CONFIG')
    }

    const config = decryptConfig(tenantId, encryptedData) as unknown as LdapSyncConfig

    // ── 2. Fetch users from LDAP ──────────────────────────────────────────────
    const ldapUsers = await SyncUsersFromLDAPUseCase.fetchLdapUsers(config)

    // ── 3. Sync to database ───────────────────────────────────────────────────
    const result = await this.syncUsers(tenantId, ldapUsers, config)

    // ── 4. Record sync ────────────────────────────────────────────────────────
    integration.recordSync()
    await this.integRepo.update(integration)

    return result
  }

  // ── Private: fetch from LDAP ─────────────────────────────────────────────

  private static async fetchLdapUsers(
    config: LdapSyncConfig,
  ): Promise<Array<{ email: string; name: string; role: Role }>> {
    const ldap = await requireLdapJs()
    const client = ldap.createClient({ url: config.ldapUrl }) as LdapClient

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      client.bind(config.bindDn, config.bindPassword, (bindErr: Error | null) => {
        if (bindErr) {
          reject(new Error(`LDAP bind failed: ${bindErr.message}`))
          return
        }

        const searchOpts = {
          filter: config.searchFilter,
          scope: 'sub',
          attributes: [
            config.attributes.email,
            config.attributes.name,
            ...(config.attributes.role !== undefined ? [config.attributes.role] : []),
          ],
        }

        const users: Array<{ email: string; name: string; role: Role }> = []

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        client.search(config.searchBase, searchOpts, (searchErr: Error | null, res: LdapClient) => {
          if (searchErr) {
            reject(new Error(`LDAP search failed: ${searchErr.message}`))
            return
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          res.on('searchEntry', (entry: LdapEntry) => {
            const attrs: Record<string, string> = {}
            for (const a of entry.attributes) {
              attrs[a.type] = a.vals[0] ?? ''
            }

            const email = attrs[config.attributes.email]
            const name = attrs[config.attributes.name]
            const rawRole =
              config.attributes.role !== undefined ? (attrs[config.attributes.role] ?? '') : ''

            if (email && name) {
              const role = (config.roleMap?.[rawRole] ?? 'TECHNICIAN') as Role
              users.push({ email: email.toLowerCase(), name, role })
            }
          })

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          res.on('error', (err: Error) => reject(err))
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          res.on('end', () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            client.unbind()
            resolve(users)
          })
        })
      })
    })
  }

  // ── Private: sync to DB ──────────────────────────────────────────────────

  private async syncUsers(
    tenantId: string,
    ldapUsers: Array<{ email: string; name: string; role: Role }>,
    _config: LdapSyncConfig,
  ): Promise<LdapSyncResult> {
    const result: LdapSyncResult = {
      created: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
      errors: [],
    }
    const ldapEmails = new Set(ldapUsers.map((u) => u.email))

    // Fetch all current MaintainHub users for this tenant
    const existing = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true },
    })
    const existingByEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]))

    // Create or update LDAP users (sequential to avoid overwhelming the DB)
    await Promise.allSettled(
      ldapUsers.map(async (ldapUser) => {
        const current = existingByEmail.get(ldapUser.email)
        try {
          if (current === undefined) {
            await this.prisma.user.create({
              data: {
                tenantId,
                email: ldapUser.email,
                name: ldapUser.name,
                role: ldapUser.role,
                passwordHash: 'LDAP_AUTH_NO_PASSWORD',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            })
            result.created += 1
          } else if (current.name !== ldapUser.name || current.role !== ldapUser.role) {
            await this.prisma.user.update({
              where: { id: current.id },
              data: { name: ldapUser.name, role: ldapUser.role, updatedAt: new Date() },
            })
            result.updated += 1
          } else {
            result.skipped += 1
          }
        } catch (err) {
          result.errors.push({
            email: ldapUser.email,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }),
    )

    // Deactivate users no longer in LDAP
    await Promise.allSettled(
      existing
        .filter((u) => !ldapEmails.has(u.email.toLowerCase()))
        .map(async (current) => {
          try {
            await this.prisma.user.update({
              where: { id: current.id },
              data: { name: `[Deactivated] ${current.name}`, updatedAt: new Date() },
            })
            result.deactivated += 1
          } catch (err) {
            result.errors.push({
              email: current.email,
              message: err instanceof Error ? err.message : String(err),
            })
          }
        }),
    )

    return result
  }
}
