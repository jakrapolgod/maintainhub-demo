// Mock notification data for demo purposes

export type NotificationType =
  | 'WO_OVERDUE'
  | 'PM_DUE'
  | 'SLA_BREACH'
  | 'LOW_STOCK'
  | 'WO_ASSIGNED'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string // ISO-8601
  isRead: boolean
  link: string
}

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    type: 'SLA_BREACH',
    title: 'SLA Breached – WO-2024-0003',
    message: 'Inspect pressure relief valve exceeded its 8-hour response SLA.',
    createdAt: '2026-05-23T07:15:00Z',
    isRead: false,
    link: '/work-orders',
  },
  {
    id: 'n2',
    type: 'WO_OVERDUE',
    title: 'Work Order Overdue – WO-2024-0001',
    message: 'Replace mechanical seal was due on 23 May and is still open.',
    createdAt: '2026-05-23T06:00:00Z',
    isRead: false,
    link: '/work-orders',
  },
  {
    id: 'n3',
    type: 'PM_DUE',
    title: 'PM Due – Pump P-001',
    message: 'Monthly pump inspection is overdue by 13 days.',
    createdAt: '2026-05-22T08:00:00Z',
    isRead: false,
    link: '/pm-schedules',
  },
  {
    id: 'n4',
    type: 'LOW_STOCK',
    title: 'Low Stock – V-Belt B48',
    message: 'V-Belt B48 (PT-002) stock is at 8 units — below the minimum of 10.',
    createdAt: '2026-05-22T04:30:00Z',
    isRead: false,
    link: '/inventory',
  },
  {
    id: 'n5',
    type: 'PM_DUE',
    title: 'PM Due in 2 Days – Cooling Tower CT-004',
    message: 'Cooling tower inspection is due on 25 May.',
    createdAt: '2026-05-21T09:00:00Z',
    isRead: true,
    link: '/pm-schedules',
  },
  {
    id: 'n6',
    type: 'WO_ASSIGNED',
    title: 'New WO Assigned – WO-2024-0005',
    message: 'Load test under full capacity has been assigned to you.',
    createdAt: '2026-05-21T07:45:00Z',
    isRead: true,
    link: '/work-orders',
  },
  {
    id: 'n7',
    type: 'LOW_STOCK',
    title: 'Low Stock – Hydraulic Pump Gear Set',
    message: 'PT-007 stock is at 2 units — below the minimum of 3.',
    createdAt: '2026-05-20T11:00:00Z',
    isRead: true,
    link: '/inventory',
  },
  {
    id: 'n8',
    type: 'WO_OVERDUE',
    title: 'Work Order Overdue – WO-2024-0004',
    message: 'Clean condenser coils is approaching its due date on 28 May.',
    createdAt: '2026-05-20T08:30:00Z',
    isRead: true,
    link: '/work-orders',
  },
]
