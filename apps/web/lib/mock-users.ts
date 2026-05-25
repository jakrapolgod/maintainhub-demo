export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER' | 'CONTRACTOR'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export interface TeamUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string
  status: UserStatus
  lastLogin: string
  skills: string[]
}

export const teamUsers: TeamUser[] = [
  {
    id: 'u1',
    name: 'Alice Chen',
    email: 'alice@maintainhub.io',
    role: 'ADMIN',
    avatar: 'AC',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T08:00:00Z',
    skills: ['HVAC', 'Electrical', 'Plumbing'],
  },
  {
    id: 'u2',
    name: 'Bob Martinez',
    email: 'bob@maintainhub.io',
    role: 'MANAGER',
    avatar: 'BM',
    status: 'ACTIVE',
    lastLogin: '2026-05-24T17:30:00Z',
    skills: ['Project Mgmt', 'Safety'],
  },
  {
    id: 'u3',
    name: 'Carol Williams',
    email: 'carol@maintainhub.io',
    role: 'TECHNICIAN',
    avatar: 'CW',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T07:15:00Z',
    skills: ['Mechanical', 'Welding', 'PLC'],
  },
  {
    id: 'u4',
    name: 'David Kim',
    email: 'david@maintainhub.io',
    role: 'TECHNICIAN',
    avatar: 'DK',
    status: 'ACTIVE',
    lastLogin: '2026-05-23T14:00:00Z',
    skills: ['Electrical', 'Instrumentation'],
  },
  {
    id: 'u5',
    name: 'Eva Rossi',
    email: 'eva@maintainhub.io',
    role: 'VIEWER',
    avatar: 'ER',
    status: 'ACTIVE',
    lastLogin: '2026-05-22T09:45:00Z',
    skills: ['Reporting'],
  },
  {
    id: 'u6',
    name: 'Frank Nguyen',
    email: 'frank@maintainhub.io',
    role: 'CONTRACTOR',
    avatar: 'FN',
    status: 'ACTIVE',
    lastLogin: '2026-05-20T11:00:00Z',
    skills: ['HVAC', 'Refrigeration'],
  },
  {
    id: 'u7',
    name: 'Grace Lee',
    email: 'grace@maintainhub.io',
    role: 'MANAGER',
    avatar: 'GL',
    status: 'INACTIVE',
    lastLogin: '2026-04-30T16:00:00Z',
    skills: ['Safety', 'Compliance'],
  },
  {
    id: 'u8',
    name: 'Henry Park',
    email: 'henry@maintainhub.io',
    role: 'TECHNICIAN',
    avatar: 'HP',
    status: 'ACTIVE',
    lastLogin: '2026-05-24T06:30:00Z',
    skills: ['Plumbing', 'HVAC', 'Mechanical'],
  },
]
