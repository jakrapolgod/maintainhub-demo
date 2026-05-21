import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PartUsageForm } from '../PartUsageForm'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUsePart = jest.fn()
const mockPartData = {
  items: [
    {
      id: 'p1',
      partNumber: 'SEAL-001',
      name: 'Mechanical Seal',
      description: null,
      quantity: 10,
      reservedQty: 2,
      unitCost: 200,
      storeLocation: 'A-01',
    },
    {
      id: 'p2',
      partNumber: 'BEAR-002',
      name: 'Bearing 6205',
      description: null,
      quantity: 2,
      reservedQty: 0,
      unitCost: 80,
      storeLocation: null,
    },
  ],
  total: 2,
}

jest.mock('@/hooks/useWorkOrders', () => ({
  useUsePart: () => ({ mutate: mockUsePart, isPending: false }),
  usePartsSearch: (search: string) => ({
    data: search.length >= 2 ? mockPartData : undefined,
    isFetching: false,
  }),
}))

function renderForm(open = true) {
  const qc = new QueryClient()
  const onClose = jest.fn()
  render(
    <QueryClientProvider client={qc}>
      <PartUsageForm workOrderId="wo-1" open={open} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

beforeEach(() => mockUsePart.mockReset())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PartUsageForm', () => {
  it('renders the dialog when open=true', () => {
    renderForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    renderForm(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows search results after typing 2+ chars', async () => {
    renderForm()
    const searchInput = screen.getByPlaceholderText(/Search by name/i)
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'se' } })
    })
    await waitFor(() => {
      expect(screen.getByText('Mechanical Seal')).toBeInTheDocument()
    })
  })

  it('does not show results for single-char search', async () => {
    renderForm()
    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), { target: { value: 's' } })
    expect(screen.queryByText('Mechanical Seal')).not.toBeInTheDocument()
  })

  it('shows stock availability for each part in dropdown', async () => {
    renderForm()
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search by name/i), { target: { value: 'se' } })
    })
    await waitFor(() => {
      // 10 total - 2 reserved = 8 available
      expect(screen.getByText(/8 avail\./i)).toBeInTheDocument()
    })
  })

  it('populates partId after selecting a part', async () => {
    renderForm()
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
        target: { value: 'seal' },
      })
    })
    await waitFor(() => screen.getByText('Mechanical Seal'))
    fireEvent.click(screen.getByText('Mechanical Seal'))
    // After selection the search box should show the part identifier
    expect(screen.getByPlaceholderText(/Search by name/i)).toHaveValue('SEAL-001 — Mechanical Seal')
  })

  it('shows stock hint card after selecting a part', async () => {
    renderForm()
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
        target: { value: 'seal' },
      })
    })
    await waitFor(() => screen.getByText('Mechanical Seal'))
    fireEvent.click(screen.getByText('Mechanical Seal'))
    expect(screen.getByText(/On hand/i)).toBeInTheDocument()
  })

  it('shows INSUFFICIENT_STOCK warning when quantity > available', async () => {
    renderForm()
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
        target: { value: 'seal' },
      })
    })
    await waitFor(() => screen.getByText('Mechanical Seal'))
    fireEvent.click(screen.getByText('Mechanical Seal'))

    const qtyInput = screen.getByLabelText(/Quantity/i)
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '99' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('insufficient-stock-warning')).toBeInTheDocument()
    })
  })

  it('does not show warning when quantity <= available', async () => {
    renderForm()
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
        target: { value: 'seal' },
      })
    })
    await waitFor(() => screen.getByText('Mechanical Seal'))
    fireEvent.click(screen.getByText('Mechanical Seal'))

    const qtyInput = screen.getByLabelText(/Quantity/i)
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '3' } })
    })

    expect(screen.queryByTestId('insufficient-stock-warning')).not.toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call usePart when no part is selected', async () => {
    renderForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Record Usage/i }))
    })
    // Give time for async validation
    await new Promise((r) => setTimeout(r, 50))
    expect(mockUsePart).not.toHaveBeenCalled()
  })
})
