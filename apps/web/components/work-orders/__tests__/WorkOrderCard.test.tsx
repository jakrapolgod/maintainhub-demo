import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkOrderCard } from '../WorkOrderCard'
import type { WorkOrderSummary } from '@/lib/api/work-orders'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeWo(overrides: Partial<WorkOrderSummary> = {}): WorkOrderSummary {
  return {
    id: 'wo-1',
    woNumber: 'WO-2024-000001',
    title: 'Replace mechanical seal on Pump P-101',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assetId: 'asset-1',
    assetName: 'Pump P-101',
    assigneeIds: ['u1'],
    assignees: [{ id: 'u1', name: 'Alice Tech', avatarUrl: null }],
    dueDate: new Date(Date.now() + 86_400_000).toISOString(),
    slaDeadline: null,
    completedAt: null,
    totalLaborCost: null,
    totalPartsCost: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkOrderCard', () => {
  it('renders the WO number', () => {
    render(<WorkOrderCard wo={makeWo()} />)
    expect(screen.getByText('WO-2024-000001')).toBeInTheDocument()
  })

  it('renders the title', () => {
    render(<WorkOrderCard wo={makeWo()} />)
    expect(screen.getByText('Replace mechanical seal on Pump P-101')).toBeInTheDocument()
  })

  it('renders the asset name', () => {
    render(<WorkOrderCard wo={makeWo()} />)
    expect(screen.getByText('Pump P-101')).toBeInTheDocument()
  })

  it('renders status and priority badges', () => {
    render(<WorkOrderCard wo={makeWo()} />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
    expect(screen.getByTestId('priority-badge')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handler = jest.fn()
    render(<WorkOrderCard wo={makeWo()} onClick={handler} />)
    fireEvent.click(screen.getByTestId('work-order-card'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClick on Enter key', () => {
    const handler = jest.fn()
    render(<WorkOrderCard wo={makeWo()} onClick={handler} />)
    fireEvent.keyDown(screen.getByTestId('work-order-card'), { key: 'Enter' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClick on Space key', () => {
    const handler = jest.fn()
    render(<WorkOrderCard wo={makeWo()} onClick={handler} />)
    fireEvent.keyDown(screen.getByTestId('work-order-card'), { key: ' ' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('has role="button" when onClick is provided', () => {
    render(<WorkOrderCard wo={makeWo()} onClick={jest.fn()} />)
    expect(screen.getByTestId('work-order-card')).toHaveAttribute('role', 'button')
  })

  it('has no role when onClick is not provided', () => {
    render(<WorkOrderCard wo={makeWo()} />)
    expect(screen.getByTestId('work-order-card')).not.toHaveAttribute('role')
  })

  it('shows due date when dueDate is set', () => {
    const wo = makeWo({ dueDate: '2030-06-15T00:00:00.000Z' })
    render(<WorkOrderCard wo={wo} />)
    expect(screen.getByText(/Jun 15/)).toBeInTheDocument()
  })

  it('hides due date when dueDate is null', () => {
    render(<WorkOrderCard wo={makeWo({ dueDate: null })} />)
    expect(screen.queryByText(/Jun/)).not.toBeInTheDocument()
  })

  it('shows ⚠ when SLA is breached and status is not terminal', () => {
    const pastDeadline = new Date(Date.now() - 3_600_000).toISOString()
    render(<WorkOrderCard wo={makeWo({ slaDeadline: pastDeadline, status: 'IN_PROGRESS' })} />)
    expect(screen.getByText(/⚠/)).toBeInTheDocument()
  })

  it('does NOT show ⚠ for a COMPLETED WO even if SLA deadline is past', () => {
    const pastDeadline = new Date(Date.now() - 3_600_000).toISOString()
    render(<WorkOrderCard wo={makeWo({ slaDeadline: pastDeadline, status: 'COMPLETED' })} />)
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
  })

  it('applies overdue ring class when SLA is breached', () => {
    const pastDeadline = new Date(Date.now() - 3_600_000).toISOString()
    render(<WorkOrderCard wo={makeWo({ slaDeadline: pastDeadline, status: 'IN_PROGRESS' })} />)
    expect(screen.getByTestId('work-order-card').className).toMatch(/ring/)
  })

  it('applies priority border colour for CRITICAL', () => {
    render(<WorkOrderCard wo={makeWo({ priority: 'CRITICAL' })} />)
    expect(screen.getByTestId('work-order-card').className).toMatch(/border-l-red/)
  })

  it('applies priority border colour for LOW', () => {
    render(<WorkOrderCard wo={makeWo({ priority: 'LOW' })} />)
    expect(screen.getByTestId('work-order-card').className).toMatch(/border-l-slate/)
  })

  it('uses a custom testId when provided', () => {
    render(<WorkOrderCard wo={makeWo()} testId="custom-card" />)
    expect(screen.getByTestId('custom-card')).toBeInTheDocument()
  })

  it('does not have cursor-pointer class when static=true', () => {
    render(<WorkOrderCard wo={makeWo()} static onClick={jest.fn()} />)
    expect(screen.getByTestId('work-order-card').className).not.toMatch(/cursor-pointer/)
  })

  it('renders assignee "Unassigned" when no assignees', () => {
    render(<WorkOrderCard wo={makeWo({ assignees: [], assigneeIds: [] })} />)
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })
})
