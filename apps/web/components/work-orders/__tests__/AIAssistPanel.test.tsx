/**
 * AIAssistPanel unit tests.
 *
 * Strategy:
 *   - useDraftFromNL and useCreateWorkOrder are mocked so no network calls occur.
 *   - useRouter is mocked to capture navigation.
 *   - The test uses @testing-library/react's `act` to flush async state updates.
 *   - Voice input (Web Speech API) is conditionally tested via a window mock.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AIAssistPanel } from '../AIAssistPanel'

// ── jsdom polyfills ────────────────────────────────────────────────────────────

// scrollIntoView is not implemented in jsdom; polyfill it so auto-scroll works.
Element.prototype.scrollIntoView = jest.fn()

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))

const mockDraftMutate = jest.fn()
const mockCreateMutate = jest.fn()

jest.mock('@/hooks/useWorkOrders', () => ({
  useDraftFromNL: () => ({ mutate: mockDraftMutate, isPending: false }),
  useCreateWorkOrder: () => ({ mutate: mockCreateMutate, isPending: false }),
}))

// Mock apiFetch used for asset search
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn().mockResolvedValue({ items: [] }),
  API_BASE: 'http://localhost:4000/api/v1',
  tokenStore: { get: () => 'test-token', set: jest.fn(), clear: jest.fn() },
}))

// react-markdown rendered as plain text in tests
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <span>{children}</span>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockDraft = {
  title: 'Replace seal on Pump P-101',
  description: 'Pump P-101 is leaking from the shaft seal. Seal replacement required.',
  type: 'CORRECTIVE' as const,
  priority: 'HIGH' as const,
  suggestedAssignees: ['mechanical-technician'],
  estimatedHours: 4,
  originalMessage: 'Pump P-101 is leaking',
  assetId: 'asset-cuid-123',
}

function renderPanel(open = true) {
  const qc = new QueryClient()
  const onClose = jest.fn()
  render(
    <QueryClientProvider client={qc}>
      <AIAssistPanel open={open} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, qc }
}

beforeEach(() => {
  mockDraftMutate.mockReset()
  mockCreateMutate.mockReset()
  mockRouterPush.mockReset()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AIAssistPanel', () => {
  describe('rendering', () => {
    it('renders when open=true', () => {
      renderPanel(true)
      expect(screen.getByText('AI Work Order Assistant')).toBeInTheDocument()
    })

    it('does not render content when open=false', () => {
      renderPanel(false)
      expect(screen.queryByText('AI Work Order Assistant')).not.toBeInTheDocument()
    })

    it('shows welcome message on mount', () => {
      renderPanel()
      expect(screen.getByText(/I can create a work order/i)).toBeInTheDocument()
    })

    it('renders a textarea for user input', () => {
      renderPanel()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('renders Send button', () => {
      renderPanel()
      expect(screen.getByTitle(/Send/i)).toBeInTheDocument()
    })

    it('calls onClose when the header X button is clicked', () => {
      const { onClose } = renderPanel()
      // The header close button contains a sr-only "Close" span and an X icon.
      // Find it by the sr-only text node which is always in the DOM.
      const closeSpan = screen.getAllByText('Close')[0]
      const closeBtn = closeSpan?.closest('button')
      expect(closeBtn).toBeTruthy()
      fireEvent.click(closeBtn!)
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('messaging', () => {
    it('appends user message when input is submitted via Enter', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump P-101 is leaking' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      expect(screen.getByText('Pump P-101 is leaking')).toBeInTheDocument()
    })

    it('calls useDraftFromNL.mutate with the message', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump leaking badly' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      expect(mockDraftMutate).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Pump leaking badly' }),
        expect.any(Object),
      )
    })

    it('does NOT call mutate when message is empty', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: '' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })
      expect(mockDraftMutate).not.toHaveBeenCalled()
    })

    it('clears input after sending', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'test message' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      expect(textarea.value).toBe('')
    })

    it('Shift+Enter does NOT send the message', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'multi\nline' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
      expect(mockDraftMutate).not.toHaveBeenCalled()
    })
  })

  describe('draft preview', () => {
    function setupWithDraft() {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

      // Simulate successful draft response
      mockDraftMutate.mockImplementation(
        (_data: unknown, { onSuccess }: { onSuccess: (d: typeof mockDraft) => void }) =>
          onSuccess(mockDraft),
      )

      return { textarea }
    }

    it('shows draft title after successful AI response', async () => {
      const { textarea } = setupWithDraft()
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump leaking' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      await waitFor(
        () => {
          expect(screen.getByText(mockDraft.title)).toBeInTheDocument()
        },
        { timeout: 5_000 },
      )
    })

    it('shows Create Work Order button after draft arrives', async () => {
      const { textarea } = setupWithDraft()
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump leaking' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /Create Work Order/i })).toBeInTheDocument()
        },
        { timeout: 5_000 },
      )
    })

    it('shows Edit button alongside Create button', async () => {
      const { textarea } = setupWithDraft()
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'test' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument()
        },
        { timeout: 5_000 },
      )
    })

    it('calls createWorkOrder.mutate when "Create Work Order" is clicked', async () => {
      const { textarea } = setupWithDraft()
      mockCreateMutate.mockImplementation(
        (
          _data: unknown,
          { onSuccess }: { onSuccess: (d: { id: string; woNumber: string }) => void },
        ) => onSuccess({ id: 'wo-new', woNumber: 'WO-2024-000001' }),
      )

      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump leaking' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })

      await waitFor(() => screen.getByRole('button', { name: /Create Work Order/i }), {
        timeout: 5_000,
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Work Order/i }))
      })

      expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    })

    it('navigates to /work-orders/new with mode=manual when Edit is clicked', async () => {
      const { textarea } = setupWithDraft()
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Pump leaking' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })

      await waitFor(() => screen.getByRole('button', { name: /^Edit$/i }), { timeout: 5_000 })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
      })

      expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/work-orders/new'))
      expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('mode=manual'))
    })
  })

  describe('Start over', () => {
    it('shows "New" button after a message is sent', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'test' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument()
    })

    it('resets conversation when "New" is clicked', async () => {
      renderPanel()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'test message sent' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })

      const newBtn = screen.getByRole('button', { name: /New/i })
      await act(async () => {
        fireEvent.click(newBtn)
      })

      // User message should be gone
      expect(screen.queryByText('test message sent')).not.toBeInTheDocument()
      // Welcome message should be back
      expect(screen.getByText(/I can create a work order/i)).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('shows error message in chat when draft API fails', async () => {
      renderPanel()
      mockDraftMutate.mockImplementation(
        (_: unknown, { onError }: { onError: (e: Error) => void }) =>
          onError(new Error('Rate limit exceeded')),
      )

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'trigger failure' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })

      await waitFor(() => {
        expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument()
      })
    })
  })

  describe('voice input', () => {
    it('hides voice button when Web Speech API is not available', () => {
      // Default: no SpeechRecognition on jsdom
      renderPanel()
      expect(screen.queryByTitle(/Voice input/i)).not.toBeInTheDocument()
    })

    it('shows voice button when SpeechRecognition is available', () => {
      const mockRecognition = jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        abort: jest.fn(),
        onresult: null,
        onerror: null,
        onend: null,
        lang: '',
        continuous: false,
        interimResults: false,
        maxAlternatives: 1,
      }))
      // Inject mock into window
      Object.defineProperty(window, 'SpeechRecognition', {
        value: mockRecognition,
        writable: true,
        configurable: true,
      })

      renderPanel()
      expect(screen.getByTitle(/Voice input/i)).toBeInTheDocument()

      // Cleanup
      Object.defineProperty(window, 'SpeechRecognition', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('asset context', () => {
    it('shows "None (optional)" when no asset is selected', () => {
      renderPanel()
      expect(screen.getByText(/None \(optional\)/i)).toBeInTheDocument()
    })

    it('shows asset search input when context row is clicked', async () => {
      renderPanel()
      const assetToggle = screen.getByText(/Asset context:/i).closest('button')!
      await act(async () => {
        fireEvent.click(assetToggle)
      })
      expect(screen.getByPlaceholderText(/Search assets/i)).toBeInTheDocument()
    })
  })
})
