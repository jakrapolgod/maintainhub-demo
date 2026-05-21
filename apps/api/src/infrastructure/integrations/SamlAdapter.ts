/**
 * SamlAdapter — SAML 2.0 Service-Provider implementation.
 *
 * ## Package requirement
 *   npm install @node-saml/node-saml
 *   npm install --save-dev @types/node-saml
 *
 * ## Flow
 *
 *   1. IdP (Azure AD / Okta / Google) redirects the user's browser to
 *      `POST /api/v1/auth/saml/:provider/callback` with a `SAMLResponse`
 *      form field containing a base64-encoded, signed XML assertion.
 *
 *   2. `SamlAdapter.validateResponse()` verifies the XML signature using
 *      the IdP's public certificate, extracts the user profile, and returns
 *      a `SamlProfile` DTO.
 *
 *   3. The route handler calls `SamlAdapter.upsertUser()` to create or update
 *      the MaintainHub user record, mapping SAML groups → Roles.
 *
 * ## Tenant configuration (stored in Integration.config)
 *   {
 *     entryPoint:    string   // IdP SSO URL
 *     issuer:        string   // SP entity ID (our app)
 *     cert:          string   // IdP public certificate (PEM, no headers)
 *     groupAttribute?: string // SAML attribute carrying group memberships
 *     groupRoleMap?: Record<string, Role>  // SAML group name → MaintainHub role
 *   }
 */
import type { PrismaClient } from '@prisma/client'
import { DomainException } from '../../errors/domain.exception.js'

// ── Dependency: @node-saml/node-saml ─────────────────────────────────────────
// Loaded dynamically to avoid hard-crash when the package is not installed.
// Install with:  npm install @node-saml/node-saml
//
// We use `any` here because the package may not be installed in the development
// environment; the runtime will throw `SAML_PACKAGE_MISSING` if it is absent.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nodeSaml: { SAML: new (opts: Record<string, unknown>) => any } | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireNodeSaml(): Promise<{ SAML: new (opts: Record<string, unknown>) => any }> {
  if (nodeSaml !== undefined) return nodeSaml
  try {
    // Use require() at runtime so TypeScript never tries to resolve the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, global-require
    nodeSaml = require('@node-saml/node-saml') as never
    return nodeSaml!
  } catch {
    throw new DomainException(
      'SAML authentication requires @node-saml/node-saml. Run: npm install @node-saml/node-saml',
      'SAML_PACKAGE_MISSING',
    )
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SamlProvider = 'azure_ad' | 'okta' | 'google'

export interface SamlTenantConfig {
  entryPoint: string
  issuer: string
  /** IdP public certificate in PEM format (without -----BEGIN CERTIFICATE----- headers). */
  cert: string
  /** SAML attribute name that carries group memberships. Defaults to 'groups'. */
  groupAttribute?: string
  /** Map from SAML group name to MaintainHub role. */
  groupRoleMap?: Record<string, 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER'>
  /** Callback URL registered with the IdP. */
  callbackUrl: string
}

export interface SamlProfile {
  email: string
  name: string
  groups: string[]
  nameId: string
  /** Mapped MaintainHub role derived from groupRoleMap (defaults to VIEWER). */
  mappedRole: 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER' | 'CONTRACTOR'
}

export interface UpsertedUser {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
  isNew: boolean
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SamlAdapter {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate the SAML AuthnRequest redirect URL for the given tenant.
   * Returns a URL the browser should be redirected to in order to initiate SSO.
   */
  // eslint-disable-next-line class-methods-use-this
  async buildLoginUrl(config: SamlTenantConfig): Promise<string> {
    const { SAML } = await requireNodeSaml()

    const saml = new SAML({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      callbackUrl: config.callbackUrl,
    })

    return new Promise((resolve, reject) => {
      saml.getAuthorizeUrl({}, (err: Error | null, url?: string) => {
        if (err ?? !url) {
          reject(err ?? new Error('No URL returned'))
          return
        }
        resolve(url)
      })
    })
  }

  /**
   * Validate a SAML response posted to the callback URL.
   * Verifies the XML signature, decrypts assertions if needed, and returns
   * a normalised SamlProfile.
   *
   * @throws DomainException SAML_VALIDATION_FAILED on any verification error.
   */
  // eslint-disable-next-line class-methods-use-this
  async validateResponse(samlResponse: string, config: SamlTenantConfig): Promise<SamlProfile> {
    const { SAML } = await requireNodeSaml()

    const saml = new SAML({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      callbackUrl: config.callbackUrl,
    })

    let profile: Record<string, unknown>
    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse })
      profile = result.profile as Record<string, unknown>
    } catch (err) {
      throw new DomainException(
        `SAML validation failed: ${err instanceof Error ? err.message : String(err)}`,
        'SAML_VALIDATION_FAILED',
      )
    }

    if (!profile) {
      throw new DomainException('SAML response contained no profile', 'SAML_VALIDATION_FAILED')
    }

    // ── Extract email ────────────────────────────────────────────────────────
    const email = SamlAdapter.extractEmail(profile)
    if (!email) {
      throw new DomainException('SAML response missing email attribute', 'SAML_MISSING_EMAIL')
    }

    // ── Extract display name ─────────────────────────────────────────────────
    const name = SamlAdapter.extractName(profile) ?? email.split('@')[0] ?? 'Unknown'

    // ── Extract groups ────────────────────────────────────────────────────────
    const groupAttr = config.groupAttribute ?? 'groups'
    const rawGroups = profile[groupAttr]
    let groups: string[]
    if (Array.isArray(rawGroups)) {
      groups = rawGroups.map(String)
    } else if (typeof rawGroups === 'string') {
      groups = [rawGroups]
    } else {
      groups = []
    }

    // ── Map groups → role ─────────────────────────────────────────────────────
    const mappedRole = SamlAdapter.mapGroupsToRole(groups, config.groupRoleMap ?? {})

    return {
      email: email.toLowerCase(),
      name,
      groups,
      nameId: (profile.nameID as string) ?? email,
      mappedRole,
    }
  }

  /**
   * Create or update a MaintainHub user from a validated SAML profile.
   * Returns the user record and whether it was newly created.
   */
  async upsertUser(tenantId: string, profile: SamlProfile): Promise<UpsertedUser> {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: profile.email },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    })

    if (existing !== null) {
      // Update name and role on each login to stay in sync with IdP
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { name: profile.name, role: profile.mappedRole, updatedAt: new Date() },
      })
      return { ...existing, role: profile.mappedRole, isNew: false }
    }

    // First-time login — create the user
    const newUser = await this.prisma.user.create({
      data: {
        tenantId,
        email: profile.email,
        name: profile.name,
        role: profile.mappedRole,
        // SAML users have no local password — set a sentinel that bcrypt won't match
        passwordHash: 'SAML_AUTH_NO_PASSWORD',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    })

    return { ...newUser, isNew: true }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static extractEmail(profile: Record<string, unknown>): string | null {
    const candidates = [
      'email',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
      'nameID',
    ]
    for (const key of candidates) {
      const val = profile[key]
      if (typeof val === 'string' && val.includes('@')) return val
    }
    return null
  }

  private static extractName(profile: Record<string, unknown>): string | null {
    const candidates = [
      'displayName',
      'http://schemas.microsoft.com/identity/claims/displayname',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      'name',
    ]
    for (const key of candidates) {
      const val = profile[key]
      if (typeof val === 'string' && val.length > 0) return val
    }
    return null
  }

  private static mapGroupsToRole(
    groups: string[],
    groupRoleMap: Record<string, 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER'>,
  ): 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER' | 'CONTRACTOR' {
    const ROLE_PRIORITY: Record<string, number> = {
      ADMIN: 4,
      MANAGER: 3,
      TECHNICIAN: 2,
      VIEWER: 1,
      CONTRACTOR: 0,
    }

    let best: 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER' | 'CONTRACTOR' = 'VIEWER'

    for (const group of groups) {
      const mapped = groupRoleMap[group]
      if (mapped !== undefined && (ROLE_PRIORITY[mapped] ?? 0) > (ROLE_PRIORITY[best] ?? 0)) {
        best = mapped
      }
    }

    return best
  }
}
