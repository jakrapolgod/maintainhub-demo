import type { Meta, StoryObj } from '@storybook/react'
import { WorkOrderCard } from './WorkOrderCard'
import type { WorkOrderSummary } from '@/lib/api/work-orders'

const baseWo: WorkOrderSummary = {
  id: 'clh7z2d1h0000z1x1z1x1z1x1',
  woNumber: 'WO-2024-000099',
  title: 'Replace mechanical seal on Pump P-101',
  type: 'CORRECTIVE',
  priority: 'HIGH',
  status: 'IN_PROGRESS',
  assetId: 'asset-1',
  assetName: 'Pump P-101',
  assigneeIds: ['u1', 'u2'],
  assignees: [
    { id: 'u1', name: 'Alice Technician', avatarUrl: null },
    { id: 'u2', name: 'Bob Technician', avatarUrl: null },
  ],
  dueDate: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
  slaDeadline: null,
  completedAt: null,
  totalLaborCost: 4_000,
  totalPartsCost: 1_200,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const meta = {
  title: 'WorkOrders/WorkOrderCard',
  component: WorkOrderCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { wo: baseWo },
} satisfies Meta<typeof WorkOrderCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { onClick: () => alert('clicked') },
}

export const Critical: Story = {
  args: { wo: { ...baseWo, priority: 'CRITICAL', status: 'OPEN' } },
}

export const Overdue: Story = {
  args: {
    wo: {
      ...baseWo,
      priority: 'CRITICAL',
      slaDeadline: new Date(Date.now() - 3_600_000).toISOString(),
      status: 'IN_PROGRESS',
    },
  },
}

export const Completed: Story = {
  args: { wo: { ...baseWo, status: 'COMPLETED', completedAt: new Date().toISOString() } },
}

export const Unassigned: Story = {
  args: { wo: { ...baseWo, assigneeIds: [], assignees: [] } },
}

export const ManyAssignees: Story = {
  args: {
    wo: {
      ...baseWo,
      assignees: Array.from({ length: 5 }, (_, i) => ({
        id: `u${i}`,
        name: `User ${i + 1}`,
        avatarUrl: null,
      })),
    },
  },
}

export const NoDueDate: Story = {
  args: { wo: { ...baseWo, dueDate: null, slaDeadline: null } },
}

export const LowPriority: Story = {
  args: { wo: { ...baseWo, priority: 'LOW', status: 'DRAFT' } },
}

export const StaticCard: Story = {
  args: { static: true },
  name: 'Static (in drag overlay)',
}
