/**
 * Unit tests for integration command handlers.
 */

// Mock global fetch
import { WebhookEndpoint, WebhookEndpointId, Integration, IntegrationId } from '@maintainhub/domain'
import { CreateWebhookEndpointHandler } from '../create-webhook-endpoint.js'
import { UpdateWebhookEndpointHandler } from '../update-webhook-endpoint.js'
import { DeleteWebhookEndpointHandler } from '../delete-webhook-endpoint.js'
import { ConnectIntegrationHandler, encryptConfig, decryptConfig } from '../connect-integration.js'
import type { CommandContext } from '../command.types.js'

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENDPOINT_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const INTEG_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const VALID_URL = 'https://hooks.example.com/maintainhub'
const VALID_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1234'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'ADMIN',
  ipAddress: null,
  userAgent: null,
}

function makePrisma() {
  return {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    webhookDelivery: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
}

function makeDb() {
  return {}
}

function makeEndpoint(isActive = false) {
  return WebhookEndpoint.reconstitute({
    id: new WebhookEndpointId(ENDPOINT_ID),
    tenantId: TENANT_ID,
    url: VALID_URL,
    secret: VALID_SECRET,
    events: ['WORK_ORDER_CREATED', 'PM_TRIGGERED'],
    isActive,
    failureCount: 0,
    lastDeliveredAt: undefined,
    createdById: USER_ID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
  })
}

function makeEndpointRepo(endpoint = makeEndpoint()) {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(endpoint),
    delete: jest.fn().mockResolvedValue(undefined),
    findByTenant: jest.fn().mockResolvedValue([endpoint]),
    findActiveByEventType: jest.fn().mockResolvedValue([endpoint]),
  }
}

function makeIntegRepo(integration?: Integration) {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(integration),
    delete: jest.fn().mockResolvedValue(undefined),
    findByTenant: jest.fn().mockResolvedValue([]),
    findByProvider: jest.fn().mockResolvedValue(integration),
  }
}

// ── CreateWebhookEndpointHandler ──────────────────────────────────────────────

describe('CreateWebhookEndpointHandler', () => {
  beforeEach(() => mockFetch.mockReset())

  it('creates endpoint when URL is reachable', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    const repo = makeEndpointRepo()
    const handler = new CreateWebhookEndpointHandler(makeDb() as never, makePrisma() as never, repo)

    const result = await handler.handle(
      {
        url: VALID_URL,
        events: ['WORK_ORDER_CREATED'],
      },
      ctx,
    )

    expect(result.id).toBeTruthy()
    expect(result.secret).toHaveLength(80) // 40 bytes = 80 hex chars
    expect(repo.save).toHaveBeenCalledTimes(1)
  })

  it('accepts caller-supplied secret', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    const repo = makeEndpointRepo()
    const handler = new CreateWebhookEndpointHandler(makeDb() as never, makePrisma() as never, repo)

    const result = await handler.handle(
      {
        url: VALID_URL,
        events: ['WORK_ORDER_CREATED'],
        secret: VALID_SECRET,
      },
      ctx,
    )

    expect(result.secret).toBe(VALID_SECRET)
  })

  it('throws WEBHOOK_URL_UNREACHABLE on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const handler = new CreateWebhookEndpointHandler(
      makeDb() as never,
      makePrisma() as never,
      makeEndpointRepo(),
    )

    await expect(
      handler.handle({ url: VALID_URL, events: ['WORK_ORDER_CREATED'] }, ctx),
    ).rejects.toMatchObject({ code: 'WEBHOOK_URL_UNREACHABLE' })
  })

  it('throws WEBHOOK_URL_UNREACHABLE on AbortError (timeout)', async () => {
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortErr)
    const handler = new CreateWebhookEndpointHandler(
      makeDb() as never,
      makePrisma() as never,
      makeEndpointRepo(),
    )

    await expect(
      handler.handle({ url: VALID_URL, events: ['WORK_ORDER_CREATED'] }, ctx),
    ).rejects.toMatchObject({ code: 'WEBHOOK_URL_UNREACHABLE' })
  })

  it('accepts HTTP 404 response (host is reachable)', async () => {
    // A 404 means the host is up — endpoint configuration is the caller's problem
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    const repo = makeEndpointRepo()
    const handler = new CreateWebhookEndpointHandler(makeDb() as never, makePrisma() as never, repo)

    await expect(
      handler.handle({ url: VALID_URL, events: ['WORK_ORDER_CREATED'] }, ctx),
    ).resolves.toBeTruthy()
  })
})

// ── UpdateWebhookEndpointHandler ──────────────────────────────────────────────

describe('UpdateWebhookEndpointHandler', () => {
  it('updates URL and events', async () => {
    const endpoint = makeEndpoint()
    const repo = makeEndpointRepo(endpoint)
    const handler = new UpdateWebhookEndpointHandler(makePrisma() as never, repo)

    await handler.handle(
      {
        id: ENDPOINT_ID,
        url: 'https://new-endpoint.example.com/wh',
        events: ['WORK_ORDER_COMPLETED'],
      },
      ctx,
    )

    expect(endpoint.url).toBe('https://new-endpoint.example.com/wh')
    expect(repo.update).toHaveBeenCalledWith(endpoint)
  })

  it('activates when isActive=true', async () => {
    const endpoint = makeEndpoint(false)
    const repo = makeEndpointRepo(endpoint)
    const handler = new UpdateWebhookEndpointHandler(makePrisma() as never, repo)

    await handler.handle({ id: ENDPOINT_ID, isActive: true }, ctx)

    expect(endpoint.isActive).toBe(true)
    expect(repo.update).toHaveBeenCalledWith(endpoint)
  })

  it('deactivates when isActive=false', async () => {
    const endpoint = makeEndpoint(true)
    const repo = makeEndpointRepo(endpoint)
    const handler = new UpdateWebhookEndpointHandler(makePrisma() as never, repo)

    await handler.handle({ id: ENDPOINT_ID, isActive: false }, ctx)

    expect(endpoint.isActive).toBe(false)
  })

  it('throws WEBHOOK_ENDPOINT_NOT_FOUND when missing', async () => {
    const repo = makeEndpointRepo()
    repo.findById = jest.fn().mockResolvedValue(undefined)
    const handler = new UpdateWebhookEndpointHandler(makePrisma() as never, repo)

    await expect(handler.handle({ id: ENDPOINT_ID, url: VALID_URL }, ctx)).rejects.toMatchObject({
      code: 'WEBHOOK_ENDPOINT_NOT_FOUND',
    })
  })
})

// ── DeleteWebhookEndpointHandler ──────────────────────────────────────────────

describe('DeleteWebhookEndpointHandler', () => {
  it('deactivates endpoint and cancels pending deliveries', async () => {
    const endpoint = makeEndpoint(true)
    const repo = makeEndpointRepo(endpoint)
    const prisma = makePrisma()
    const handler = new DeleteWebhookEndpointHandler(prisma as never, repo)

    await handler.handle({ id: ENDPOINT_ID }, ctx)

    expect(endpoint.isActive).toBe(false)
    expect(repo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ value: ENDPOINT_ID }),
      TENANT_ID,
    )
    expect(prisma.webhookDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ webhookEndpointId: ENDPOINT_ID, status: 'PENDING' }),
      }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('throws WEBHOOK_ENDPOINT_NOT_FOUND when missing', async () => {
    const repo = makeEndpointRepo()
    repo.findById = jest.fn().mockResolvedValue(undefined)
    const handler = new DeleteWebhookEndpointHandler(makePrisma() as never, repo)

    await expect(handler.handle({ id: ENDPOINT_ID }, ctx)).rejects.toMatchObject({
      code: 'WEBHOOK_ENDPOINT_NOT_FOUND',
    })
  })
})

// ── ConnectIntegrationHandler — AES encryption ───────────────────────────────

describe('ConnectIntegrationHandler — AES-256-GCM encryption', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV, INTEGRATION_MASTER_KEY: 'a'.repeat(32) }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('encryptConfig + decryptConfig round-trips the plain config', () => {
    const original = { botToken: 'xoxb-secret-token', channelId: 'C123' }
    const encrypted = encryptConfig(TENANT_ID, original)
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)

    const decrypted = decryptConfig(TENANT_ID, encrypted)
    expect(decrypted).toEqual(original)
  })

  it('different tenants produce different ciphertext', () => {
    const cfg = { key: 'value' }
    const enc1 = encryptConfig('tenant-1', cfg)
    const enc2 = encryptConfig('tenant-2', cfg)
    expect(enc1).not.toBe(enc2)
  })

  it('decryption fails with wrong tenant (authentication tag mismatch)', () => {
    const enc = encryptConfig('tenant-1', { key: 'value' })
    expect(() => decryptConfig('tenant-2', enc)).toThrow()
  })

  it('ConnectIntegrationHandler saves encrypted config for Slack', async () => {
    // Mock Slack's auth.test endpoint
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true, team: 'TestTeam' }),
    }) as typeof fetch

    const repo = makeIntegRepo()
    const handler = new ConnectIntegrationHandler(makeDb() as never, makePrisma() as never, repo)

    const id = await handler.handle(
      {
        provider: 'slack',
        config: { botToken: 'xoxb-test-token' },
      },
      ctx,
    )

    expect(id).toBeTruthy()
    expect(repo.save).toHaveBeenCalledTimes(1)

    const saved = (repo.save.mock.calls[0] as [Integration])[0]
    // Config should be encrypted (not plain-text)
    const storedConfig = saved.config
    expect(typeof storedConfig.encryptedData).toBe('string')
    expect(storedConfig.botToken).toBeUndefined()

    global.fetch = mockFetch as typeof fetch
  })

  it('ConnectIntegrationHandler updates existing integration', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true }),
    }) as typeof fetch

    const existingIntegration = Integration.reconstitute({
      id: new IntegrationId(INTEG_ID),
      tenantId: TENANT_ID,
      provider: 'slack',
      config: { _encrypted: 'old' },
      isActive: true,
      lastSyncAt: undefined,
      createdById: USER_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
    })

    const repo = makeIntegRepo(existingIntegration)
    const handler = new ConnectIntegrationHandler(makeDb() as never, makePrisma() as never, repo)

    await handler.handle({ provider: 'slack', config: { botToken: 'new-token' } }, ctx)

    expect(repo.update).toHaveBeenCalledTimes(1)
    expect(repo.save).not.toHaveBeenCalled()

    global.fetch = mockFetch as typeof fetch
  })

  it('throws INTEGRATION_CONNECTION_FAILED on invalid Slack token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: false, error: 'invalid_auth' }),
    }) as typeof fetch

    const repo = makeIntegRepo()
    const handler = new ConnectIntegrationHandler(makeDb() as never, makePrisma() as never, repo)

    await expect(
      handler.handle({ provider: 'slack', config: { botToken: 'bad' } }, ctx),
    ).rejects.toMatchObject({ code: 'INTEGRATION_CONNECTION_FAILED' })

    global.fetch = mockFetch as typeof fetch
  })
})
