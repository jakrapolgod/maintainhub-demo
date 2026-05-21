/**
 * OAuthAdapter — OAuth 2.0 Authorization Code flow adapter.
 *
 * Supports Google Workspace and Microsoft Azure AD without Passport.js.
 * Uses the standard OAuth 2.0 PKCE + Authorization Code flow via fetch().
 *
 * ## Flow
 *
 *   1. GET  /api/v1/auth/oauth/:provider        → redirect to IdP
 *   2. GET  /api/v1/auth/oauth/:provider/callback → exchange code for tokens
 *   3. Fetch user profile from IdP userinfo endpoint
 *   4. Upsert user in DB (same logic as SAML adapter)
 *
 * ## Package requirement
 * None — implemented with Node.js built-ins (fetch + crypto).
 *
 * ## Tenant configuration (Integration.config)
 *   {
 *     clientId:     string
 *     clientSecret: string  // store encrypted
 *     redirectUri:  string
 *     // Optional: for Azure AD tenant-specific endpoints
 *     tenantId?:    string  // Azure AD tenant ID (GUID)
 *   }
 */
import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { DomainException } from '../../errors/domain.exception.js'

// ── Provider definitions ──────────────────────────────────────────────────────

export type OAuthProvider = 'google_workspace' | 'azure_ad'

interface ProviderConfig {
  authorizationUrl: (tenantHint?: string) => string
  tokenUrl: (tenantHint?: string) => string
  userinfoUrl: string
  scopes: string[]
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google_workspace: {
    authorizationUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  azure_ad: {
    authorizationUrl: (tid) =>
      `https://login.microsoftonline.com/${tid ?? 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: (tid) => `https://login.microsoftonline.com/${tid ?? 'common'}/oauth2/v2.0/token`,
    userinfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OAuthClientConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Azure AD only: the tenant GUID for single-tenant apps. */
  azureTenantId?: string
}

export interface OAuthState {
  /** Random nonce to prevent CSRF. */
  nonce: string
  /** Original page the user was trying to reach (for post-login redirect). */
  returnTo: string
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | undefined
  expiresAt: Date
  idToken: string | undefined
}

export interface OAuthUserProfile {
  email: string
  name: string
  sub: string // provider-specific unique ID
  groups: string[] // Google: empty; Azure: group GUIDs from /memberOf
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

export class OAuthAdapter {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Step 1: Build authorization URL ───────────────────────────────────────

  // eslint-disable-next-line class-methods-use-this
  buildAuthorizationUrl(
    provider: OAuthProvider,
    clientConfig: OAuthClientConfig,
    state: OAuthState,
  ): string {
    const prov = PROVIDERS[provider]
    const stateParam = Buffer.from(JSON.stringify(state)).toString('base64url')
    const params = new URLSearchParams({
      client_id: clientConfig.clientId,
      redirect_uri: clientConfig.redirectUri,
      response_type: 'code',
      scope: prov.scopes.join(' '),
      state: stateParam,
      // OIDC: request id_token in addition to authorization code
      response_mode: 'query',
    })

    if (provider === 'google_workspace') {
      params.set('access_type', 'offline')
      params.set('prompt', 'consent')
    }

    const base = prov.authorizationUrl(clientConfig.azureTenantId)
    return `${base}?${params.toString()}`
  }

  /** Generate a cryptographically random state nonce. */
  static generateNonce(): string {
    return randomBytes(32).toString('hex')
  }

  /** Decode and parse the state parameter returned in the callback. */
  static decodeState(encodedState: string): OAuthState {
    try {
      const decoded = Buffer.from(encodedState, 'base64url').toString('utf8')
      return JSON.parse(decoded) as OAuthState
    } catch {
      throw new DomainException('Invalid OAuth state parameter', 'OAUTH_INVALID_STATE')
    }
  }

  // ── Step 2: Exchange authorization code for tokens ─────────────────────────

  // eslint-disable-next-line class-methods-use-this
  async exchangeCode(
    provider: OAuthProvider,
    code: string,
    clientConfig: OAuthClientConfig,
  ): Promise<OAuthTokens> {
    const prov = PROVIDERS[provider]
    const tokenUrl = prov.tokenUrl(clientConfig.azureTenantId)

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: clientConfig.redirectUri,
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new DomainException(
        `OAuth token exchange failed (${res.status}): ${text.slice(0, 500)}`,
        'OAUTH_TOKEN_EXCHANGE_FAILED',
      )
    }

    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      id_token?: string
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
      idToken: json.id_token,
    }
  }

  // ── Step 3: Fetch user profile ─────────────────────────────────────────────

  // eslint-disable-next-line class-methods-use-this
  async fetchUserProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthUserProfile> {
    const prov = PROVIDERS[provider]

    const res = await fetch(prov.userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new DomainException(
        `Failed to fetch OAuth user profile (${res.status})`,
        'OAUTH_PROFILE_FETCH_FAILED',
      )
    }

    const json = (await res.json()) as Record<string, unknown>

    if (provider === 'google_workspace') {
      return OAuthAdapter.parseGoogleProfile(json)
    }
    return OAuthAdapter.parseAzureProfile(json)
  }

  // ── Step 4: Upsert user ────────────────────────────────────────────────────

  async upsertUser(tenantId: string, profile: OAuthUserProfile): Promise<UpsertedUser> {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: profile.email },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    })

    if (existing !== null) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { name: profile.name, updatedAt: new Date() },
      })
      return { ...existing, isNew: false }
    }

    const newUser = await this.prisma.user.create({
      data: {
        tenantId,
        email: profile.email,
        name: profile.name,
        role: 'TECHNICIAN', // default role; admin promotes as needed
        passwordHash: 'OAUTH_AUTH_NO_PASSWORD',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    })

    return { ...newUser, isNew: true }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static parseGoogleProfile(json: Record<string, unknown>): OAuthUserProfile {
    const email = typeof json.email === 'string' ? json.email : ''
    if (!email) throw new DomainException('Google profile missing email', 'OAUTH_MISSING_EMAIL')
    return {
      email: email.toLowerCase(),
      name: typeof json.name === 'string' ? json.name : email,
      sub: typeof json.sub === 'string' ? json.sub : email,
      groups: [],
    }
  }

  private static parseAzureProfile(json: Record<string, unknown>): OAuthUserProfile {
    // MS Graph /me returns userPrincipalName or mail for email
    const email = (
      (typeof json.mail === 'string' ? json.mail : '') ||
      (typeof json.userPrincipalName === 'string' ? json.userPrincipalName : '')
    ).toLowerCase()

    if (!email) throw new DomainException('Azure AD profile missing email', 'OAUTH_MISSING_EMAIL')

    const displayName = typeof json.displayName === 'string' ? json.displayName : email
    const id = typeof json.id === 'string' ? json.id : email

    return { email, name: displayName, sub: id, groups: [] }
  }
}
