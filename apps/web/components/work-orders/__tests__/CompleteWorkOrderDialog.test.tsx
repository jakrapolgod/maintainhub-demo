import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompleteWorkOrderDialog } from '../CompleteWorkOrderDialog'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockComplete = jest.fn()

jest.mock('@/hooks/useWorkOrders', () => ({
  useCompleteWorkOrder: () => ({ mutate: mockComplete, isPending: false }),
  useWorkOrderLabor: () => ({
    data: [
      {
        id: 'le1',
        technicianId: 'u1',
        technicianName: 'Alice',
        date: '2024-06-01',
        hours: 4,
        ratePerHour: 500,
        totalCost: 2000,
        description: null,
      },
    ],
    isPending: false,
  }),
  useWorkOrderParts: () => ({
    data: [
      {
        id: 'pu1',
        partId: 'p1',
        partNumber: 'S-001',
        partName: 'Seal',
        quantity: 1,
        unitCost: 200,
        totalCost: 200,
        usedAt: '2024-06-01',
      },
    ],
    isPending: false,
  }),
  useFailureCodes: () => ({
    data: [
      {
        id: 'fc1',
        code: 'MECH-001',
        name: 'Seal Failure',
        category: 'Mechanical',
        system: null,
        notes: null,
      },
      {
        id: 'fc2',
        code: 'MECH-002',
        name: 'Bearing Wear',
        category: 'Mechanical',
        system: null,
        notes: null,
      },
      {
        id: 'fc3',
        code: 'ELEC-001',
        name: 'Motor Burnout',
        category: 'Electrical',
        system: null,
        notes: null,
      },
    ],
    isPending: false,
  }),
}))

function renderDialog(open = true) {
  const qc = new QueryClient()
  const onClose = jest.fn()
  render(
    <QueryClientProvider client={qc}>
      <CompleteWorkOrderDialog workOrderId="wo-1" open={open} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

beforeEach(() => mockComplete.mockReset())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompleteWorkOrderDialog', () => {
  it('renders when open=true', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the resolution textarea', () => {
    renderDialog()
    expect(screen.getByLabelText(/Resolution/i)).toBeInTheDocument()
  })

  it('Confirm button is disabled when resolution is empty', () => {
    renderDialog()
    const confirmBtn = screen.getByRole('button', { name: /Mark Complete/i })
    expect(confirmBtn).toBeDisabled()
  })

  it('Confirm button is disabled when resolution < 10 chars', async () => {
    renderDialog()
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Resolution/i), { target: { value: 'short' } })
    })
    expect(screen.getByRole('button', { name: /Mark Complete/i })).toBeDisabled()
  })

  it('Confirm button is enabled when resolution ≥ 10 chars', async () => {
    renderDialog()
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Resolution/i), {
        target: { value: 'Seal replaced and tested OK' },
      })
    })
    expect(screen.getByRole('button', { name: /Mark Complete/i })).not.toBeDisabled()
  })

  it('shows character count hint', async () => {
    renderDialog()
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Resolution/i), { target: { value: 'hello' } })
    })
    expect(screen.getByText(/5\/10 min/i)).toBeInTheDocument()
  })

  it('displays labor summary', () => {
    renderDialog()
    // 4 hours × ฿500 = ฿2,000 total labor
    expect(screen.getByText(/4.0/)).toBeInTheDocument()
  })

  it('displays parts cost in the summary table', () => {
    renderDialog()
    // The parts row shows ฿200 total cost
    expect(screen.getAllByText(/200/).length).toBeGreaterThan(0)
  })

  it('calls mutate with resolution on submit', async () => {
    mockComplete.mockImplementation((_d: unknown, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    )
    renderDialog()
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Resolution/i), {
        target: { value: 'Seal replaced and tested OK' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Mark Complete/i }))
    })
    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledTimes(1)
      const [payload] = mockComplete.mock.calls[0] as [{ resolution: string }]
      expect(payload.resolution).toBe('Seal replaced and tested OK')
    })
  })

  it('does not call mutate when resolution is too short', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText(/Resolution/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /Mark Complete/i }))
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('renders the failure code section label', () => {
    renderDialog()
    // The label for the section is "Failure Code"
    expect(screen.getByText(/Failure Code/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
