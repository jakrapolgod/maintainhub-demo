import { can, listAllowed } from '../permissions'
import type { Action, Resource } from '../permissions'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_RESOURCES: Resource[] = [
  'work-order',
  'asset',
  'asset-category',
  'location',
  'pm-schedule',
  'part',
  'user',
  'tenant',
  'report',
  'audit-log',
]

// ── can() — happy-path spot checks ───────────────────────────────────────────

describe('can() — ADMIN', () => {
  it('allows everything on work-order', () => {
    const actions: Action[] = [
      'create',
      'read',
      'update',
      'delete',
      'assign',
      'start',
      'complete',
      'cancel',
      'add-labor',
      'add-part',
      'add-comment',
    ]
    for (const action of actions) {
      expect(can('ADMIN', 'work-order', action)).toBe('allow')
    }
  })

  it('allows tenant update (exclusive to ADMIN)', () => {
    expect(can('ADMIN', 'tenant', 'update')).toBe('allow')
  })

  it('allows user delete (exclusive to ADMIN)', () => {
    expect(can('ADMIN', 'user', 'delete')).toBe('allow')
  })

  it('allows audit-log read', () => {
    expect(can('ADMIN', 'audit-log', 'read')).toBe('allow')
  })
})

describe('can() — MANAGER', () => {
  it('allows work-order create, read, update, assign, start, complete, cancel', () => {
    const actions: Action[] = [
      'create',
      'read',
      'update',
      'assign',
      'start',
      'complete',
      'cancel',
      'add-labor',
      'add-part',
      'add-comment',
    ]
    for (const action of actions) {
      expect(can('MANAGER', 'work-order', action)).toBe('allow')
    }
  })

  it('denies work-order delete', () => {
    expect(can('MANAGER', 'work-order', 'delete')).toBe('deny')
  })

  it('denies tenant update', () => {
    expect(can('MANAGER', 'tenant', 'update')).toBe('deny')
  })

  it('denies user delete', () => {
    expect(can('MANAGER', 'user', 'delete')).toBe('deny')
  })

  it('allows user invite', () => {
    expect(can('MANAGER', 'user', 'invite')).toBe('allow')
  })

  it('allows PM schedule trigger', () => {
    expect(can('MANAGER', 'pm-schedule', 'trigger')).toBe('allow')
  })

  it('allows audit-log read', () => {
    expect(can('MANAGER', 'audit-log', 'read')).toBe('allow')
  })
})

describe('can() — TECHNICIAN', () => {
  it('allows work-order read, start, complete, add-labor, add-part, add-comment', () => {
    const actions: Action[] = ['read', 'start', 'complete', 'add-labor', 'add-part', 'add-comment']
    for (const action of actions) {
      expect(can('TECHNICIAN', 'work-order', action)).toBe('allow')
    }
  })

  it('denies work-order create, assign, cancel, delete', () => {
    const denied: Action[] = ['create', 'assign', 'cancel', 'delete']
    for (const action of denied) {
      expect(can('TECHNICIAN', 'work-order', action)).toBe('deny')
    }
  })

  it('allows asset read', () => {
    expect(can('TECHNICIAN', 'asset', 'read')).toBe('allow')
  })

  it('denies asset create/update/delete', () => {
    expect(can('TECHNICIAN', 'asset', 'create')).toBe('deny')
    expect(can('TECHNICIAN', 'asset', 'update')).toBe('deny')
    expect(can('TECHNICIAN', 'asset', 'delete')).toBe('deny')
  })

  it('allows part read (needed for WO part recording)', () => {
    expect(can('TECHNICIAN', 'part', 'read')).toBe('allow')
  })

  it('denies audit-log read', () => {
    expect(can('TECHNICIAN', 'audit-log', 'read')).toBe('deny')
  })

  it('allows user read (for assignment UI)', () => {
    expect(can('TECHNICIAN', 'user', 'read')).toBe('allow')
  })

  it('allows report read', () => {
    expect(can('TECHNICIAN', 'report', 'read')).toBe('allow')
  })
})

describe('can() — VIEWER', () => {
  it('allows read on core operational resources', () => {
    const readable: Resource[] = [
      'work-order',
      'asset',
      'asset-category',
      'location',
      'pm-schedule',
      'part',
      'report',
    ]
    for (const resource of readable) {
      expect(can('VIEWER', resource, 'read')).toBe('allow')
    }
  })

  it('denies all mutations on work-order', () => {
    const mutations: Action[] = [
      'create',
      'update',
      'delete',
      'assign',
      'start',
      'complete',
      'cancel',
      'add-labor',
      'add-part',
      'add-comment',
    ]
    for (const action of mutations) {
      expect(can('VIEWER', 'work-order', action)).toBe('deny')
    }
  })

  it('denies user read (external viewers should not see the org chart)', () => {
    expect(can('VIEWER', 'user', 'read')).toBe('deny')
  })

  it('denies audit-log read', () => {
    expect(can('VIEWER', 'audit-log', 'read')).toBe('deny')
  })

  it('denies tenant read', () => {
    expect(can('VIEWER', 'tenant', 'read')).toBe('deny')
  })
})

describe('can() — CONTRACTOR', () => {
  it('returns own for work-order read (restricted to assigned WOs)', () => {
    expect(can('CONTRACTOR', 'work-order', 'read')).toBe('own')
  })

  it('returns own for work-order add-labor (restricted to assigned WOs)', () => {
    expect(can('CONTRACTOR', 'work-order', 'add-labor')).toBe('own')
  })

  it('returns own for work-order add-comment (restricted to assigned WOs)', () => {
    expect(can('CONTRACTOR', 'work-order', 'add-comment')).toBe('own')
  })

  it('denies work-order create, update, delete, assign, start, complete, cancel, add-part', () => {
    const denied: Action[] = [
      'create',
      'update',
      'delete',
      'assign',
      'start',
      'complete',
      'cancel',
      'add-part',
    ]
    for (const action of denied) {
      expect(can('CONTRACTOR', 'work-order', action)).toBe('deny')
    }
  })

  it('denies access to assets, PM schedules, parts, users', () => {
    const denied: Array<[Resource, Action]> = [
      ['asset', 'read'],
      ['pm-schedule', 'read'],
      ['part', 'read'],
      ['user', 'read'],
      ['tenant', 'read'],
      ['audit-log', 'read'],
      ['report', 'read'],
    ]
    for (const [resource, action] of denied) {
      expect(can('CONTRACTOR', resource, action)).toBe('deny')
    }
  })
})

// ── Safe defaults ─────────────────────────────────────────────────────────────

describe('can() — safe defaults', () => {
  it('returns deny for an unknown action on a known resource', () => {
    expect(can('ADMIN', 'work-order', 'invite' as Action)).toBe('deny')
  })

  it('returns deny when action is not listed for that resource', () => {
    // tenant has no 'create' action defined
    expect(can('ADMIN', 'tenant', 'create')).toBe('deny')
  })
})

// ── Structural invariants ─────────────────────────────────────────────────────

describe('can() — structural invariants', () => {
  it('ADMIN can do at least as much as MANAGER on every resource', () => {
    const managerAllowed = listAllowed('MANAGER')
    for (const { resource, action } of managerAllowed) {
      expect(can('ADMIN', resource, action)).toBe('allow')
    }
  })

  it('VIEWER never has more access than MANAGER on the same resource+action', () => {
    for (const resource of ALL_RESOURCES) {
      // If MANAGER denies, VIEWER should also deny
      const actions: Action[] = [
        'create',
        'update',
        'delete',
        'assign',
        'start',
        'complete',
        'cancel',
      ]
      for (const action of actions) {
        if (can('MANAGER', resource, action) === 'deny') {
          expect(can('VIEWER', resource, action)).toBe('deny')
        }
      }
    }
  })

  it('listAllowed returns non-empty list for ADMIN', () => {
    expect(listAllowed('ADMIN').length).toBeGreaterThan(0)
  })

  it('listAllowed returns empty list for roles with no allow entries (sanity check)', () => {
    // CONTRACTOR has no 'allow' entries — only 'own' and 'deny'
    const contractorAllowed = listAllowed('CONTRACTOR')
    expect(contractorAllowed).toHaveLength(0)
  })
})
