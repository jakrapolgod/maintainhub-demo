import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'
import type { WOStatus } from '@/lib/api/work-orders'

const ALL_STATUSES: WOStatus[] = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]

describe('StatusBadge', () => {
  it.each(ALL_STATUSES)('renders label for %s', (status) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
  })

  it('shows "Draft" text for DRAFT status', () => {
    render(<StatusBadge status="DRAFT" />)
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Draft')
  })

  it('shows "In Progress" text for IN_PROGRESS status', () => {
    render(<StatusBadge status="IN_PROGRESS" />)
    expect(screen.getByTestId('status-badge')).toHaveTextContent('In Progress')
  })

  it('sets data-status attribute to the raw status value', () => {
    render(<StatusBadge status="COMPLETED" />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', 'COMPLETED')
  })

  it('applies compact class when compact=true', () => {
    const { rerender } = render(<StatusBadge status="OPEN" compact={false} />)
    const normal = screen.getByTestId('status-badge').className

    rerender(<StatusBadge status="OPEN" compact={true} />)
    const compact = screen.getByTestId('status-badge').className

    // Compact uses a smaller text class
    expect(compact).not.toBe(normal)
  })

  it('forwards extra className', () => {
    render(<StatusBadge status="OPEN" className="extra-class" />)
    expect(screen.getByTestId('status-badge')).toHaveClass('extra-class')
  })

  it('renders COMPLETED with emerald colour class', () => {
    render(<StatusBadge status="COMPLETED" />)
    expect(screen.getByTestId('status-badge').className).toMatch(/emerald/)
  })

  it('renders CANCELLED with red colour class', () => {
    render(<StatusBadge status="CANCELLED" />)
    expect(screen.getByTestId('status-badge').className).toMatch(/red/)
  })

  it('renders all six statuses without crashing', () => {
    const { unmount } = render(
      <div>
        {ALL_STATUSES.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>,
    )
    expect(screen.getAllByTestId('status-badge')).toHaveLength(6)
    unmount()
  })
})
