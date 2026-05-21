/* eslint-disable class-methods-use-this */
/**
 * WorkOrderRepository interface contract test.
 *
 * This file has two purposes:
 *
 *  1. **Compile-time** — TypeScript verifies that `StubRepository` fully
 *     satisfies `WorkOrderRepository`. A missing or incorrectly typed method
 *     causes a compile error here, not a mysterious runtime failure later.
 *
 *  2. **Runtime** — a minimal smoke test proves that a concrete class
 *     implementing the interface passes `typeof` checks and method presence
 *     checks, giving CI a green signal that the interface is importable and
 *     structurally sound.
 *
 * We do NOT test persistence behaviour here — that belongs in integration
 * tests for the specific infrastructure adapter (e.g. PrismaWorkOrderRepository).
 */
import { type WorkOrderId } from '../value-objects/work-order-id'
import { type WorkOrder } from '../WorkOrder'
import type { WorkOrderRepository, WOFilters } from '../WorkOrderRepository'
import type { StatusValue } from '../value-objects/work-order-status'

// ── Stub implementation (compile-time contract check) ─────────────────────────

/**
 * A no-op stub that implements every method declared in `WorkOrderRepository`.
 * If you add a method to the interface without adding it here, TypeScript will
 * produce a compile error pointing directly to the missing implementation.
 */
class StubRepository implements WorkOrderRepository {
  findById(_id: WorkOrderId, _tenantId: string): Promise<WorkOrder | null> {
    return Promise.resolve(null)
  }

  findByAsset(_assetId: string, _tenantId: string): Promise<WorkOrder[]> {
    return Promise.resolve([])
  }

  findByAssignee(_userId: string, _tenantId: string, _status?: StatusValue): Promise<WorkOrder[]> {
    return Promise.resolve([])
  }

  findByFilters(
    _filters: WOFilters,
    _tenantId: string,
  ): Promise<{ items: WorkOrder[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 })
  }

  findOverdueSLA(_tenantId: string): Promise<WorkOrder[]> {
    return Promise.resolve([])
  }

  save(_workOrder: WorkOrder): Promise<void> {
    return Promise.resolve()
  }

  delete(_id: WorkOrderId, _tenantId: string): Promise<void> {
    return Promise.resolve()
  }

  nextWONumber(_tenantId: string): Promise<string> {
    return Promise.resolve('WO-2024-000001')
  }
}

// ── Method presence checks ────────────────────────────────────────────────────

describe('WorkOrderRepository interface contract', () => {
  const repo = new StubRepository()

  const EXPECTED_METHODS: Array<keyof WorkOrderRepository> = [
    'findById',
    'findByAsset',
    'findByAssignee',
    'findByFilters',
    'findOverdueSLA',
    'save',
    'delete',
    'nextWONumber',
  ]

  it.each(EXPECTED_METHODS)('declares method "%s"', (method) => {
    expect(typeof repo[method]).toBe('function')
  })

  it('has exactly the expected set of methods (no extra, none missing)', () => {
    const actualMethods = Object.getOwnPropertyNames(StubRepository.prototype).filter(
      (m) => m !== 'constructor',
    )
    const expectedSet = new Set<string>(EXPECTED_METHODS)
    const actualSet = new Set<string>(actualMethods)
    expect(actualSet).toEqual(expectedSet)
  })
})

// ── WOFilters shape ───────────────────────────────────────────────────────────

describe('WOFilters', () => {
  it('accepts a fully populated filter object', () => {
    const filters: WOFilters = {
      status: ['OPEN', 'IN_PROGRESS'],
      priority: 'HIGH',
      type: 'CORRECTIVE',
      assetId: 'asset-1',
      assigneeId: 'user-1',
      search: 'pump',
      page: 2,
      limit: 50,
      from: new Date('2024-01-01'),
      to: new Date('2024-12-31'),
    }
    expect(filters.page).toBe(2)
    expect(filters.status).toEqual(['OPEN', 'IN_PROGRESS'])
  })

  it('accepts an empty filter object (no constraints)', () => {
    const filters: WOFilters = {}
    expect(Object.keys(filters)).toHaveLength(0)
  })

  it('accepts a single-value status string (not array)', () => {
    const filters: WOFilters = { status: 'OPEN' }
    expect(filters.status).toBe('OPEN')
  })
})

// ── nextWONumber format ───────────────────────────────────────────────────────

describe('nextWONumber() return format', () => {
  it('the stub returns a correctly formatted WO number', async () => {
    const repo = new StubRepository()
    const number = await repo.nextWONumber('tenant-1')
    expect(number).toMatch(/^WO-\d{4}-\d{6}$/)
  })
})
