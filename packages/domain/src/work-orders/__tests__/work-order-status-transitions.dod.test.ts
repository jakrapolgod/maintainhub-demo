/**
 * DoD #6 — Invalid status transition: completing a DRAFT work order.
 *
 * Acceptance criteria
 * ───────────────────
 * Calling `wo.complete()` on a DRAFT (or any non-IN_PROGRESS) work order
 * MUST throw a DomainException with code 'INVALID_COMPLETION'.
 *
 * This verifies the domain aggregate enforces state-machine invariants
 * independently of the application or infrastructure layers.
 */
import { WorkOrder } from '../WorkOrder'
import { Priority, WorkOrderId, WorkOrderStatus } from '../value-objects/index'
import { DomainException } from '../../errors/domain.exception'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

function makeWo(status: WorkOrderStatus) {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: 'tenant-1',
    woNumber: 'WO-2024-000001',
    title: 'Fix pump',
    type: 'CORRECTIVE',
    priority: Priority.HIGH,
    status,
    assetId: 'asset-1',
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DoD #6 — Invalid status transitions', () => {
  // ── complete() preconditions ───────────────────────────────────────────────

  it('throws INVALID_COMPLETION when completing a DRAFT WO', () => {
    const wo = makeWo(WorkOrderStatus.DRAFT)
    expect(() => wo.complete('tech-1', 'Fixed it')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when completing an OPEN WO', () => {
    const wo = makeWo(WorkOrderStatus.OPEN)
    expect(() => wo.complete('tech-1', 'Fixed it')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when completing an ON_HOLD WO', () => {
    const wo = makeWo(WorkOrderStatus.ON_HOLD)
    expect(() => wo.complete('tech-1', 'Fixed it')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when completing an already-COMPLETED WO', () => {
    const wo = makeWo(WorkOrderStatus.COMPLETED)
    expect(() => wo.complete('tech-1', 'Fixed it again')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when completing a CANCELLED WO', () => {
    const wo = makeWo(WorkOrderStatus.CANCELLED)
    expect(() => wo.complete('tech-1', 'Fixed it')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('succeeds when completing an IN_PROGRESS WO', () => {
    const wo = makeWo(WorkOrderStatus.IN_PROGRESS)
    expect(() => wo.complete('tech-1', 'Seal replaced')).not.toThrow()
    expect(wo.status.value).toBe('COMPLETED')
  })

  // ── Error type contract ────────────────────────────────────────────────────

  it('throws a DomainException (not a generic Error) for DRAFT→COMPLETED', () => {
    const wo = makeWo(WorkOrderStatus.DRAFT)
    expect(() => wo.complete('tech-1', 'Fixed it')).toThrow(DomainException)
  })

  it('includes the current status in the error message', () => {
    const wo = makeWo(WorkOrderStatus.DRAFT)
    try {
      wo.complete('tech-1', 'Fixed it')
      fail('should have thrown')
    } catch (err) {
      expect((err as DomainException).message).toContain('DRAFT')
    }
  })

  // ── start() preconditions ──────────────────────────────────────────────────

  it('throws INVALID_START when starting a DRAFT WO', () => {
    const wo = makeWo(WorkOrderStatus.DRAFT)
    expect(() => wo.start()).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('throws INVALID_START when starting a COMPLETED WO', () => {
    const wo = makeWo(WorkOrderStatus.COMPLETED)
    expect(() => wo.start()).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  // ── cancel() preconditions ─────────────────────────────────────────────────

  it('throws CANNOT_CANCEL_COMPLETED when cancelling a COMPLETED WO', () => {
    const wo = makeWo(WorkOrderStatus.COMPLETED)
    expect(() => wo.cancel('No longer needed', 'user-1')).toThrow(
      expect.objectContaining({ code: 'CANNOT_CANCEL_COMPLETED' }),
    )
  })

  it('throws ALREADY_CANCELLED when cancelling an already-CANCELLED WO', () => {
    const wo = makeWo(WorkOrderStatus.CANCELLED)
    expect(() => wo.cancel('No longer needed', 'user-1')).toThrow(
      expect.objectContaining({ code: 'ALREADY_CANCELLED' }),
    )
  })

  // ── hold() preconditions ───────────────────────────────────────────────────

  it('throws INVALID_HOLD when holding a DRAFT WO', () => {
    const wo = makeWo(WorkOrderStatus.DRAFT)
    expect(() => wo.hold('Waiting for parts')).toThrow(
      expect.objectContaining({ code: 'INVALID_HOLD' }),
    )
  })

  // ── assign() preconditions ─────────────────────────────────────────────────

  it('throws INVALID_ASSIGNMENT when assigning a COMPLETED WO', () => {
    const wo = makeWo(WorkOrderStatus.COMPLETED)
    expect(() => wo.assign('tech-1', 'manager-1')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNMENT' }),
    )
  })
})
