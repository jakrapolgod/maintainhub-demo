/**
 * LaborEntryForm tests.
 *
 * Strategy: mock the useAddLabor hook so we never touch the network.
 * The mock is reset between each test via beforeEach.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LaborEntryForm } from '../LaborEntryForm'

// ── Mock the mutation hook ─────────────────────────────────────────────────────

const mockMutate = jest.fn()

jest.mock('@/hooks/useWorkOrders', () => ({
  useAddLabor: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForm(open = true) {
  const qc = new QueryClient()
  const onClose = jest.fn()
  const { rerender, unmount } = render(
    <QueryClientProvider client={qc}>
      <LaborEntryForm workOrderId="wo-1" open={open} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, qc, rerender, unmount }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => mockMutate.mockReset())

describe('LaborEntryForm', () => {
  it('renders the dialog when open=true', () => {
    renderForm(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render dialog content when open=false', () => {
    renderForm(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders date, hours, rate, and description fields', () => {
    renderForm()
    expect(screen.getByLabelText(/Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Hours/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rate/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument()
  })

  it('shows the live total cost preview', () => {
    renderForm()
    // Default: 1 hour × 500 = ฿500
    expect(screen.getByTestId('labor-total-preview')).toBeInTheDocument()
    expect(screen.getByTestId('labor-total-preview')).toHaveTextContent('500')
  })

  it('updates total cost when hours change', async () => {
    renderForm()
    const hoursInput = screen.getByLabelText(/Hours/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(hoursInput, { target: { value: '4' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('labor-total-preview')).toHaveTextContent('2,000')
    })
  })

  it('updates total cost when rate changes', async () => {
    renderForm()
    const rateInput = screen.getByLabelText(/Rate/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(rateInput, { target: { value: '1000' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('labor-total-preview')).toHaveTextContent('1,000')
    })
  })

  it('calls mutate with correct payload on valid submit', async () => {
    mockMutate.mockImplementation((_data: unknown, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    )
    renderForm()

    const submitBtn = screen.getByRole('button', { name: /Save Entry/i })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1)
      const [payload] = mockMutate.mock.calls[0] as [{ hours: number; rate: number }]
      expect(payload.hours).toBe(1)
      expect(payload.rate).toBe(500)
    })
  })

  it('shows validation error when hours is below 0.5', async () => {
    renderForm()
    const hoursInput = screen.getByLabelText(/Hours/i)
    fireEvent.change(hoursInput, { target: { value: '0.2' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Entry/i }))
    await waitFor(() => {
      expect(screen.getByText(/Minimum 0.5/i)).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('shows validation error when hours exceeds 24', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Hours/i), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Entry/i }))
    await waitFor(() => {
      expect(screen.getByText(/Maximum 24/i)).toBeInTheDocument()
    })
  })

  it('shows validation error when rate is zero', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Rate/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Entry/i }))
    await waitFor(() => {
      expect(screen.getByText(/Rate must be positive/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
