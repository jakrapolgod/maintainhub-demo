import type { Role } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Every protected resource in the system.
 * Add new resources here as modules are built; every new resource must also
 * be added to the PERMISSIONS matrix below.
 */
export type Resource =
  | 'work-order'
  | 'asset'
  | 'asset-category'
  | 'location'
  | 'pm-schedule'
  | 'part'
  | 'user'
  | 'tenant'
  | 'report'
  | 'audit-log'

/**
 * Every action that can be performed on a resource.
 * Not every resource supports every action — undefined entries default to 'deny'.
 */
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'assign' // WO → assign technicians
  | 'start' // WO → OPEN/DRAFT → IN_PROGRESS
  | 'complete' // WO → IN_PROGRESS → COMPLETED
  | 'cancel' // WO → * → CANCELLED
  | 'add-labor' // WO → log time entry
  | 'add-part' // WO → record part usage
  | 'add-comment' // WO → add comment
  | 'trigger' // PM schedule → manual WO creation
  | 'invite' // User → invite by email

/**
 * Three-level permission value.
 *
 *  allow — unrestricted access to all resources of this type within the tenant
 *  own   — access restricted to resources the caller is assigned to / owns
 *           (enforced at the service/route layer via request.requiresOwnership)
 *  deny  — no access; results in HTTP 403
 */
export type Permission = 'allow' | 'own' | 'deny'

/** Full matrix type — every resource and action is optional; missing = 'deny'. */
type PermissionMatrix = Partial<Record<Resource, Partial<Record<Action, Record<Role, Permission>>>>>

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_ROLES: Role[] = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER', 'CONTRACTOR']

/**
 * Builds a Role→Permission entry.
 * Roles not listed in `explicit` default to 'deny'.
 *
 * @example
 *   row({ ADMIN: 'allow', MANAGER: 'allow' })
 *   // → { ADMIN:'allow', MANAGER:'allow', TECHNICIAN:'deny', VIEWER:'deny', CONTRACTOR:'deny' }
 */
function row(explicit: Partial<Record<Role, Permission>>): Record<Role, Permission> {
  return Object.fromEntries(ALL_ROLES.map((r) => [r, explicit[r] ?? 'deny'])) as Record<
    Role,
    Permission
  >
}

// ── Permission matrix ────────────────────────────────────────────────────────
//
// Reading guide
// ─────────────
//  Column   = Role
//  Row      = Resource : Action
//  Cell     = 'allow' | 'own' | 'deny'
//
//  'own' means the role has access only to resources they are assigned to.
//  Routes must check request.requiresOwnership and apply the secondary filter.

const PERMISSIONS: PermissionMatrix = {
  // ── Work Orders ──────────────────────────────────────────────────────────
  // Core CMMS resource — fine-grained per-action permissions.

  'work-order': {
    //                        ADMIN     MANAGER   TECHNICIAN  VIEWER   CONTRACTOR
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({
      ADMIN: 'allow',
      MANAGER: 'allow',
      TECHNICIAN: 'allow',
      VIEWER: 'allow',
      CONTRACTOR: 'own',
    }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
    assign: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    start: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow' }),
    complete: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow' }),
    cancel: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    'add-labor': row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', CONTRACTOR: 'own' }),
    'add-part': row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow' }),
    'add-comment': row({
      ADMIN: 'allow',
      MANAGER: 'allow',
      TECHNICIAN: 'allow',
      CONTRACTOR: 'own',
    }),
  },

  // ── Assets ───────────────────────────────────────────────────────────────
  // Physical / virtual equipment registry.

  asset: {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
  },

  // ── Asset categories ──────────────────────────────────────────────────────

  'asset-category': {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
  },

  // ── Locations ─────────────────────────────────────────────────────────────

  location: {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
  },

  // ── Preventive Maintenance Schedules ──────────────────────────────────────

  'pm-schedule': {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
    trigger: row({ ADMIN: 'allow', MANAGER: 'allow' }),
  },

  // ── Inventory / Parts ─────────────────────────────────────────────────────

  part: {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
  },

  // ── Users ────────────────────────────────────────────────────────────────
  // Technicians can read peers (needed for WO assignment UI).
  // Only ADMIN can permanently delete users; MANAGER can invite.

  user: {
    create: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow' }),
    update: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    delete: row({ ADMIN: 'allow' }),
    invite: row({ ADMIN: 'allow', MANAGER: 'allow' }),
  },

  // ── Tenant ───────────────────────────────────────────────────────────────
  // Settings, branding, plan. Only ADMIN can mutate.

  tenant: {
    read: row({ ADMIN: 'allow', MANAGER: 'allow' }),
    update: row({ ADMIN: 'allow' }),
  },

  // ── Reports & Analytics ───────────────────────────────────────────────────

  report: {
    read: row({ ADMIN: 'allow', MANAGER: 'allow', TECHNICIAN: 'allow', VIEWER: 'allow' }),
  },

  // ── Audit Log ────────────────────────────────────────────────────────────
  // Immutable record — ADMIN and MANAGER can inspect but never mutate.

  'audit-log': {
    read: row({ ADMIN: 'allow', MANAGER: 'allow' }),
  },
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up the permission for a given role / resource / action triple.
 *
 * Returns 'deny' for any combination not explicitly listed — safe default.
 * Routes and services should treat 'own' as conditional access and verify
 * resource ownership via request.requiresOwnership.
 *
 * @example
 *   can('MANAGER',     'work-order', 'complete') // → 'allow'
 *   can('VIEWER',      'work-order', 'create')   // → 'deny'
 *   can('CONTRACTOR',  'work-order', 'read')     // → 'own'
 *   can('TECHNICIAN',  'asset',      'delete')   // → 'deny'
 */
export function can(role: Role, resource: Resource, action: Action): Permission {
  return PERMISSIONS[resource]?.[action]?.[role] ?? 'deny'
}

/**
 * Returns every (resource, action) pair where the given role has 'allow'.
 * Useful for generating permission summaries in admin UIs.
 */
export function listAllowed(role: Role): Array<{ resource: Resource; action: Action }> {
  const result: Array<{ resource: Resource; action: Action }> = []
  for (const [resource, actions] of Object.entries(PERMISSIONS)) {
    for (const [action, roles] of Object.entries(actions ?? {})) {
      if (roles[role] === 'allow') {
        result.push({ resource: resource as Resource, action: action as Action })
      }
    }
  }
  return result
}
