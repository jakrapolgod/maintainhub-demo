import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { PriorityBadge } from '../PriorityBadge'
import type { WOPriority } from '@/lib/api/work-orders'

const ALL_PRIORITIES: WOPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

describe('PriorityBadge', () => {
  it.each(ALL_PRIORITIES)('renders without crashing for %s', (priority) => {
    render(<PriorityBadge priority={priority} />)
    expect(screen.getByTestId('priority-badge')).toBeInTheDocument()
  })

  it('sets data-priority attribute', () => {
    render(<PriorityBadge priority="CRITICAL" />)
    expect(screen.getByTestId('priority-badge')).toHaveAttribute('data-priority', 'CRITICAL')
  })

  it('shows label text by default', () => {
    render(<PriorityBadge priority="HIGH" />)
    expect(screen.getByTestId('priority-badge')).toHaveTextContent('High')
  })

  it('hides label text when iconOnly=true', () => {
    render(<PriorityBadge priority="HIGH" iconOnly />)
    expect(screen.getByTestId('priority-badge')).not.toHaveTextContent('High')
  })

  it('CRITICAL uses red colour class', () => {
    render(<PriorityBadge priority="CRITICAL" />)
    expect(screen.getByTestId('priority-badge').className).toMatch(/red/)
  })

  it('LOW uses slate colour class', () => {
    render(<PriorityBadge priority="LOW" />)
    expect(screen.getByTestId('priority-badge').className).toMatch(/slate/)
  })

  it('renders an icon (svg) inside the badge', () => {
    render(<PriorityBadge priority="CRITICAL" />)
    expect(screen.getByTestId('priority-badge').querySelector('svg')).toBeInTheDocument()
  })

  it('forwards extra className', () => {
    render(<PriorityBadge priority="MEDIUM" className="my-class" />)
    expect(screen.getByTestId('priority-badge')).toHaveClass('my-class')
  })

  it('applies compact styling when compact=true', () => {
    const { rerender } = render(<PriorityBadge priority="HIGH" compact={false} />)
    const normalCls = screen.getByTestId('priority-badge').className

    rerender(<PriorityBadge priority="HIGH" compact={true} />)
    const compactCls = screen.getByTestId('priority-badge').className

    expect(compactCls).not.toBe(normalCls)
  })

  it('renders title attribute for accessibility', () => {
    render(<PriorityBadge priority="MEDIUM" />)
    expect(screen.getByTestId('priority-badge')).toHaveAttribute('title', 'Medium')
  })
})
