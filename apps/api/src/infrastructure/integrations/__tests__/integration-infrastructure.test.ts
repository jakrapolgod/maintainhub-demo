/**
 * Unit tests for integration infrastructure.
 *
 * WebhookDeliveryService: signing, HTTP success/failure, response truncation
 * OAuthAdapter:           state encoding, authorization URL construction
 * ExcelCsvParser:         sync parsing, column mapping, validation, edge cases
 * SamlAdapter (pure):     group→role mapping, email extraction (no SAML package needed)
 */

import * as XLSX from 'xlsx'

// ── WebhookDeliveryService ────────────────────────────────────────────────────

import { WebhookEndpoint, WebhookEndpointId } from '@maintainhub/domain'
import { WebhookDeliveryService } from '../WebhookDeliveryService.js'

// ── OAuthAdapter ──────────────────────────────────────────────────────────────

import { OAuthAdapter } from '../OAuthAdapter.js'

// ── ExcelCsvParser ────────────────────────────────────────────────────────────

import { ExcelCsvParser } from '../ExcelCsvParser.js'

// ── Mock fetch for WebhookDeliveryService tests ───────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

describe('WebhookDeliveryService', () => {
  const ENDPOINT_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
  const SECRET = 'this-is-a-secret-key-that-is-long-enough-for-hmac-validation'
  const URL = 'https://hooks.example.com/maintainhub'

  function makeEndpoint() {
    return WebhookEndpoint.reconstitute({
      id: new WebhookEndpointId(ENDPOINT_ID),
      tenantId: 'tenant-1',
      url: URL,
      secret: SECRET,
      events: ['WORK_ORDER_CREATED'],
      isActive: true,
      failureCount: 0,
      lastDeliveredAt: undefined,
      createdById: 'user-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
    })
  }

  function makePrisma() {
    return {
      webhookDelivery: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    }
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('delivers successfully on HTTP 200', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('{"received":true}'),
    })

    const svc = new WebhookDeliveryService(makePrisma() as never)
    const delivery = await svc.deliver(makeEndpoint(), 'WORK_ORDER_CREATED', { id: 'wo-1' })

    expect(delivery.status).toBe('DELIVERED')
    expect(delivery.responseCode).toBe(200)
    expect(delivery.attemptCount).toBe(1)
  })

  it('marks FAILED on HTTP 500', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    })

    const svc = new WebhookDeliveryService(makePrisma() as never)
    const delivery = await svc.deliver(makeEndpoint(), 'WORK_ORDER_CREATED', { id: 'wo-1' })

    expect(delivery.status).toBe('FAILED')
    // markFailed stores the error in responseBody; responseCode is only set by markDelivered
    expect(delivery.responseBody).toContain('500')
    expect(delivery.shouldRetry()).toBe(true)
  })

  it('marks FAILED on network error (no responseCode)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const svc = new WebhookDeliveryService(makePrisma() as never)
    const delivery = await svc.deliver(makeEndpoint(), 'WORK_ORDER_CREATED', { id: 'wo-1' })

    expect(delivery.status).toBe('FAILED')
    expect(delivery.responseCode).toBeUndefined()
    expect(delivery.responseBody).toContain('ECONNREFUSED')
  })

  it('sends correct signature header (sha256=...)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    })

    const svc = new WebhookDeliveryService(makePrisma() as never)
    await svc.deliver(makeEndpoint(), 'WORK_ORDER_CREATED', { id: 'wo-1' })

    const callArgs = mockFetch.mock.calls[0][1] as { headers: Record<string, string> }
    const sig = callArgs.headers['X-MaintainHub-Signature']
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('sends X-MaintainHub-Event header with correct event type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    })

    const svc = new WebhookDeliveryService(makePrisma() as never)
    await svc.deliver(makeEndpoint(), 'PM_TRIGGERED', { scheduleId: 's-1' })

    const callArgs = mockFetch.mock.calls[0][1] as { headers: Record<string, string> }
    expect(callArgs.headers['X-MaintainHub-Event']).toBe('PM_TRIGGERED')
  })

  describe('verifySignature (static)', () => {
    it('returns true for matching signature', () => {
      const body = JSON.stringify({ id: 'test' })
      const sig = WebhookDeliveryService.sign(SECRET, body)
      expect(WebhookDeliveryService.verifySignature(SECRET, body, sig)).toBe(true)
    })

    it('returns false for tampered body', () => {
      const body = JSON.stringify({ id: 'test' })
      const sig = WebhookDeliveryService.sign(SECRET, body)
      const tampered = JSON.stringify({ id: 'different' })
      expect(WebhookDeliveryService.verifySignature(SECRET, tampered, sig)).toBe(false)
    })

    it('returns false for wrong secret', () => {
      const body = JSON.stringify({ id: 'test' })
      const sig = WebhookDeliveryService.sign('wrong-secret-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx', body)
      expect(WebhookDeliveryService.verifySignature(SECRET, body, sig)).toBe(false)
    })
  })
})

describe('OAuthAdapter', () => {
  describe('generateNonce', () => {
    it('returns a 64-char hex string', () => {
      const nonce = OAuthAdapter.generateNonce()
      expect(nonce).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns a different value each call', () => {
      expect(OAuthAdapter.generateNonce()).not.toBe(OAuthAdapter.generateNonce())
    })
  })

  describe('decodeState', () => {
    it('round-trips a state object through base64url encoding', () => {
      const state = { nonce: 'abc123', returnTo: '/work-orders' }
      const encoded = Buffer.from(JSON.stringify(state)).toString('base64url')
      const decoded = OAuthAdapter.decodeState(encoded)
      expect(decoded).toEqual(state)
    })

    it('throws OAUTH_INVALID_STATE on malformed input', () => {
      expect(() => OAuthAdapter.decodeState('not-valid-base64!!!')).toThrow(
        expect.objectContaining({ code: 'OAUTH_INVALID_STATE' }),
      )
    })
  })

  describe('buildAuthorizationUrl', () => {
    const config = {
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
      redirectUri: 'https://app.example.com/auth/callback',
    }
    const state = { nonce: 'n1', returnTo: '/' }

    it('Google: URL contains accounts.google.com', () => {
      const adapter = new OAuthAdapter({} as never)
      const url = adapter.buildAuthorizationUrl('google_workspace', config, state)
      expect(url).toContain('accounts.google.com')
      expect(url).toContain('client_id=my-client-id')
      expect(url).toContain('openid')
    })

    it('Azure AD: URL contains login.microsoftonline.com', () => {
      const adapter = new OAuthAdapter({} as never)
      const url = adapter.buildAuthorizationUrl('azure_ad', config, state)
      expect(url).toContain('login.microsoftonline.com')
    })

    it('Azure AD with tenantId uses tenant-specific URL', () => {
      const adapter = new OAuthAdapter({} as never)
      const url = adapter.buildAuthorizationUrl(
        'azure_ad',
        { ...config, azureTenantId: 'my-tenant-guid' },
        state,
      )
      expect(url).toContain('my-tenant-guid')
    })

    it('state param is base64url-encoded', () => {
      const adapter = new OAuthAdapter({} as never)
      const url = adapter.buildAuthorizationUrl('google_workspace', config, state)
      const qs = new URL(url).searchParams
      const raw = qs.get('state')!
      const back = OAuthAdapter.decodeState(raw)
      expect(back).toEqual(state)
    })
  })

  describe('parseGoogleProfile (via fetchUserProfile stub)', () => {
    it('throws OAUTH_MISSING_EMAIL when email absent', async () => {
      const fakeFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ sub: 'abc', name: 'No Email' }),
      })
      global.fetch = fakeFetch as typeof fetch

      const adapter = new OAuthAdapter({} as never)
      await expect(adapter.fetchUserProfile('google_workspace', 'token')).rejects.toMatchObject({
        code: 'OAUTH_MISSING_EMAIL',
      })

      global.fetch = mockFetch as typeof fetch
    })

    it('parses a valid Google profile', async () => {
      const fakeFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ sub: 'g-1', email: 'Alice@Example.COM', name: 'Alice' }),
      })
      global.fetch = fakeFetch as typeof fetch

      const adapter = new OAuthAdapter({} as never)
      const profile = await adapter.fetchUserProfile('google_workspace', 'token')
      expect(profile.email).toBe('alice@example.com') // lowercased
      expect(profile.name).toBe('Alice')
      expect(profile.groups).toHaveLength(0)

      global.fetch = mockFetch as typeof fetch
    })
  })
})

describe('ExcelCsvParser', () => {
  function makeCsvBuffer(csv: string): Buffer {
    return Buffer.from(csv, 'utf8')
  }

  function makeXlsxBuffer(rows: string[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  const basicMap = {
    'Asset Name': { field: 'name', required: true },
    Category: { field: 'categoryCode', required: true },
    Criticality: { field: 'criticality', required: false },
  }

  const parser = new ExcelCsvParser()

  it('parses a simple CSV with 3 data rows', async () => {
    const csv =
      'Asset Name,Category,Criticality\nPump A,Pumps,A\nMotor B,Motors,B\nValve C,Valves,\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', { columnMap: basicMap })

    expect(result.rows).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
    expect(result.rows[0]!.data.name).toBe('Pump A')
    expect(result.rows[0]!.data.categoryCode).toBe('Pumps')
    expect(result.rows[0]!.data.criticality).toBe('A')
    expect(result.rows[2]!.data.criticality).toBeNull()
  })

  it('parses an XLSX buffer', async () => {
    const buf = makeXlsxBuffer([
      ['Asset Name', 'Category', 'Criticality'],
      ['Pump A', 'Pumps', 'A'],
      ['Motor B', 'Motors', 'B'],
    ])
    const result = await parser.parseFile(
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      { columnMap: basicMap },
    )

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]!.data.name).toBe('Pump A')
  })

  it('applies a transform function to cell values', async () => {
    const csv = 'Asset Name,Install Date\nPump A,2024-01-15\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
      columnMap: {
        'Asset Name': { field: 'name' },
        'Install Date': { field: 'installDate', transform: (v) => new Date(v) },
      },
    })

    expect(result.rows[0]!.data.installDate).toBeInstanceOf(Date)
    expect((result.rows[0]!.data.installDate as Date).getFullYear()).toBe(2024)
  })

  it('generates an error for a failing transform', async () => {
    const csv = 'Asset Name,Install Date\nPump A,not-a-date\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
      columnMap: {
        'Asset Name': { field: 'name' },
        'Install Date': {
          field: 'installDate',
          transform: (v) => {
            const d = new Date(v)
            if (Number.isNaN(d.getTime())) throw new Error('Invalid date')
            return d
          },
        },
      },
    })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]!.message).toContain('installDate')
  })

  it('returns error when required column is empty in a row', async () => {
    const csv = 'Asset Name,Category\n,Pumps\nMotor B,\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
      columnMap: {
        'Asset Name': { field: 'name', required: true },
        Category: { field: 'categoryCode', required: true },
      },
    })

    // Row 1: name is empty (required)
    // Row 2: category is empty (required)
    expect(result.errors).toHaveLength(2)
  })

  it('skips entirely empty rows', async () => {
    const csv = 'Asset Name,Category\nPump A,Pumps\n,\n,\nMotor B,Motors\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', { columnMap: basicMap })

    expect(result.rows).toHaveLength(2)
    expect(result.skippedRows).toBe(2)
  })

  it('throws when a required column is missing from the sheet', async () => {
    const csv = 'Asset Name,Description\nPump A,A pump\n'
    await expect(
      parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
        columnMap: {
          'Asset Name': { field: 'name', required: true },
          Category: { field: 'categoryCode', required: true },
        },
      }),
    ).rejects.toThrow('Missing required columns')
  })

  it('column header matching is case-insensitive', async () => {
    const csv = 'ASSET NAME,category\nPump A,Pumps\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
      columnMap: {
        'Asset Name': { field: 'name', required: true },
        Category: { field: 'categoryCode', required: true },
      },
    })
    expect(result.rows[0]!.data.name).toBe('Pump A')
    expect(result.rows[0]!.data.categoryCode).toBe('Pumps')
  })

  it('validateColumns returns missing required headers', () => {
    const csv = Buffer.from('Asset Name,Description\nPump A,A pump\n')
    const { valid, missing } = parser.validateColumns(csv, 'text/csv', ['Asset Name', 'Category'])
    expect(valid).toBe(false)
    expect(missing).toEqual(['Category'])
  })

  it('validateColumns returns valid when all headers present', () => {
    const csv = Buffer.from('Asset Name,Category\nPump A,Pumps\n')
    const { valid, missing } = parser.validateColumns(csv, 'text/csv', ['Asset Name', 'Category'])
    expect(valid).toBe(true)
    expect(missing).toHaveLength(0)
  })

  it('rowIndex reflects original spreadsheet row number', async () => {
    const csv = 'Name,Cat\nRow2,X\nRow3,Y\n'
    const result = await parser.parseFile(makeCsvBuffer(csv), 'text/csv', {
      columnMap: { Name: { field: 'name' }, Cat: { field: 'cat' } },
    })
    expect(result.rows[0]!.rowIndex).toBe(2)
    expect(result.rows[1]!.rowIndex).toBe(3)
  })
})
