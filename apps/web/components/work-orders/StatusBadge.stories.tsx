import type { Meta, StoryObj } from '@storybook/react'
import { StatusBadge } from './StatusBadge'
import type { WOStatus } from '@/lib/api/work-orders'

const meta = {
  title: 'WorkOrders/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    status: {
      control: 'select',
      options: [
        'DRAFT',
        'OPEN',
        'IN_PROGRESS',
        'ON_HOLD',
        'COMPLETED',
        'CANCELLED',
      ] satisfies WOStatus[],
    },
  },
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Draft: Story = { args: { status: 'DRAFT' } }
export const Open: Story = { args: { status: 'OPEN' } }
export const InProgress: Story = { args: { status: 'IN_PROGRESS' } }
export const OnHold: Story = { args: { status: 'ON_HOLD' } }
export const Completed: Story = { args: { status: 'COMPLETED' } }
export const Cancelled: Story = { args: { status: 'CANCELLED' } }
export const Compact: Story = { args: { status: 'IN_PROGRESS', compact: true } }

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        ['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] satisfies WOStatus[]
      ).map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
}
