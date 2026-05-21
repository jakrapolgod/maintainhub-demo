/**
 * ConnectIntegrationHandler
 *
 * Validates external credentials, tests the connection, and persists the
 * encrypted Integration configuration.
 *
 * ## Encryption
 * Integration config (API keys, OAuth tokens) is encrypted with AES-256-GCM
 * before storage.  The key is derived per-tenant using HKDF from a master
 * secret stored in the `INTEGRATION_MASTER_KEY` environment variable.
 *
 * Storage format (all hex):
 *   `{iv(12B)}:{authTag(16B)}:{ciphertext}`
 *
 * ## Connection validation
 * Each provider has a dedicated `testConnection()` function that calls the
 * provider's API with the supplied credentials and throws on failure.
 */
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { Integration, IntegrationId } from '@maintainhub/domain'
import type { IntegrationRepository, IntegrationProvider } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generateId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Encryption helpers ─────────────────────────────────────────────────────────

const MASTER_KEY_ENV = 'INTEGRATION_MASTER_KEY'
const KEY_LENGTH = 32 // AES-256 = 32 bytes
const IV_LENGTH = 12 // GCM standard IV

function getMasterKey(): Buffer {
  const raw = process.env[MASTER_KEY_ENV]
  if (!raw || raw.length < 32) {
    throw new DomainException(
      `${MASTER_KEY_ENV} environment variable must be set (≥32 chars)`,
      'MISSING_MASTER_KEY',
    )
  }
  return Buffer.from(raw.slice(0, 64), 'utf8')
}

function deriveKey(tenantId: string): Buffer {
  const master = getMasterKey()
  return Buffer.from(
    hkdfSync(
      'sha256',
      master,
      Buffer.from(tenantId, 'utf8'),
      'MaintainHub-Integration-Key',
      KEY_LENGTH,
    ),
  )
}

export function encryptConfig(tenantId: string, config: Record<string, unknown>): string {
  const key = deriveKey(tenantId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(config)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptConfig(tenantId: string, stored: string): Record<string, unknown> {
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new DomainException('Invalid encrypted config format', 'INVALID_ENCRYPTED_CONFIG')
  }
  const [ivHex, tagHex, cipherHex] = parts as [string, string, string]
  const key = deriveKey(tenantId)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>
}

// ── Provider connection testers ───────────────────────────────────────────────

async function testSlackConnection(config: Record<string, unknown>): Promise<void> {
  const token = config.botToken as string | undefined
  if (!token)
    throw new DomainException('Slack config missing botToken', 'INVALID_INTEGRATION_CONFIG', 422)

  const res = await fetch('https://slack.com/api/auth.test', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json()) as { ok: boolean; error?: string }
  if (!json.ok) {
    throw new DomainException(
      `Slack connection test failed: ${json.error ?? 'unknown error'}`,
      'INTEGRATION_CONNECTION_FAILED',
      422,
    )
  }
}

async function testZapierConnection(config: Record<string, unknown>): Promise<void> {
  const hookUrl = config.webhookUrl as string | undefined
  if (!hookUrl?.startsWith('https://hooks.zapier.com')) {
    throw new DomainException(
      'Zapier config missing valid webhookUrl',
      'INVALID_INTEGRATION_CONFIG',
      422,
    )
  }
  // Zapier webhooks don't have an auth endpoint — just verify the URL shape
}

async function testMakeConnection(config: Record<string, unknown>): Promise<void> {
  const hookUrl = config.webhookUrl as string | undefined
  if (!hookUrl?.startsWith('https://')) {
    throw new DomainException(
      'Make config missing valid webhookUrl',
      'INVALID_INTEGRATION_CONFIG',
      422,
    )
  }
}

async function testGoogleWorkspaceConnection(config: Record<string, unknown>): Promise<void> {
  const accessToken = config.accessToken as string | undefined
  if (!accessToken)
    throw new DomainException(
      'Google Workspace config missing accessToken',
      'INVALID_INTEGRATION_CONFIG',
      422,
    )

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new DomainException(
      `Google Workspace token validation failed (${res.status})`,
      'INTEGRATION_CONNECTION_FAILED',
      422,
    )
  }
}

async function testAzureADConnection(config: Record<string, unknown>): Promise<void> {
  const accessToken = config.accessToken as string | undefined
  if (!accessToken)
    throw new DomainException(
      'Azure AD config missing accessToken',
      'INVALID_INTEGRATION_CONFIG',
      422,
    )

  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new DomainException(
      `Azure AD token validation failed (${res.status})`,
      'INTEGRATION_CONNECTION_FAILED',
      422,
    )
  }
}

const TESTERS: Record<IntegrationProvider, (cfg: Record<string, unknown>) => Promise<void>> = {
  slack: testSlackConnection,
  zapier: testZapierConnection,
  make: testMakeConnection,
  google_workspace: testGoogleWorkspaceConnection,
  azure_ad: testAzureADConnection,
}

// ── Command ───────────────────────────────────────────────────────────────────

export interface ConnectIntegrationCommand {
  provider: IntegrationProvider
  /** Plain-text config (will be encrypted before storage). */
  config: Record<string, unknown>
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class ConnectIntegrationHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
    private readonly integRepo: IntegrationRepository,
  ) {}

  async handle(cmd: ConnectIntegrationCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Test the connection before saving ──────────────────────────────────
    const tester = TESTERS[cmd.provider]
    await tester(cmd.config)

    // ── 2. Encrypt the config ─────────────────────────────────────────────────
    const encryptedConfig = { encryptedData: encryptConfig(ctx.tenantId, cmd.config) }

    // ── 3. Check for existing integration (upsert semantics) ─────────────────
    const existing = await this.integRepo.findByProvider(cmd.provider, ctx.tenantId)

    let integrationId: string

    if (existing !== undefined) {
      // Update existing
      existing.updateConfig(encryptedConfig)
      if (!existing.isActive) existing.activate()
      await this.integRepo.update(existing)
      integrationId = existing.id.value
    } else {
      // Create new
      const id = new IntegrationId(generateId())
      const integration = Integration.create({
        id,
        tenantId: ctx.tenantId,
        provider: cmd.provider,
        config: encryptedConfig,
        createdById: ctx.executingUserId,
      })
      integration.activate()
      await this.integRepo.save(integration)
      integrationId = id.value
    }

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: existing !== undefined ? 'UPDATE_INTEGRATION' : 'CREATE_INTEGRATION',
      entityType: 'Integration',
      entityId: integrationId,
      after: { provider: cmd.provider, isActive: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return integrationId
  }
}
