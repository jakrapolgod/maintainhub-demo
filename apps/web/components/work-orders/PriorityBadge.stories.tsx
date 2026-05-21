import type { Meta, StoryObj } from '@storybook/react'
import { PriorityBadge } from './PriorityBadge'
import type { WOPriority } from '@/lib/api/work-orders'

const meta = {
  title: 'WorkOrders/PriorityBadge',
  component: PriorityBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    priority: {
      control: 'select',
      options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] satisfies WOPriority[],
    },
  },
} satisfies Meta<typeof PriorityBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Critical: Story = { args: { priority: 'CRITICAL' } }
export const High: Story = { args: { priority: 'HIGH' } }
export const Medium: Story = { args: { priority: 'MEDIUM' } }
export const Low: Story = { args: { priority: 'LOW' } }
export const IconOnly: Story = { args: { priority: 'CRITICAL', iconOnly: true } }
export const Compact: Story = { args: { priority: 'HIGH', compact: true } }

export const AllPriorities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] satisfies WOPriority[]).map((p) => (
        <PriorityBadge key={p} priority={p} />
      ))}
    </div>
  ),
}

export const IconOnlyRow: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] satisfies WOPriority[]).map((p) => (
        <PriorityBadge key={p} priority={p} iconOnly />
      ))}
    </div>
  ),
  name: 'Icon Only Row',
}
