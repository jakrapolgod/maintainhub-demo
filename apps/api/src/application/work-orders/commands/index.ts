// ── Shared types ──────────────────────────────────────────────────────────────
export type { CommandContext } from './command.types.js'
export { DEFAULT_SLA_HOURS, computeSlaDeadline, writeAuditLog } from './command.types.js'

// ── Command + Handler pairs ───────────────────────────────────────────────────
export type { CreateWorkOrderCommand } from './create-work-order.js'
export { CreateWorkOrderHandler } from './create-work-order.js'

export type { UpdateWorkOrderCommand } from './update-work-order.js'
export { UpdateWorkOrderHandler } from './update-work-order.js'

export type { AssignWorkOrderCommand } from './assign-work-order.js'
export { AssignWorkOrderHandler } from './assign-work-order.js'

export type { StartWorkOrderCommand } from './start-work-order.js'
export { StartWorkOrderHandler } from './start-work-order.js'

export type { CompleteWorkOrderCommand } from './complete-work-order.js'
export { CompleteWorkOrderHandler } from './complete-work-order.js'

export type { HoldWorkOrderCommand } from './hold-work-order.js'
export { HoldWorkOrderHandler } from './hold-work-order.js'

export type { CancelWorkOrderCommand } from './cancel-work-order.js'
export { CancelWorkOrderHandler } from './cancel-work-order.js'

export type { AddLaborCommand } from './add-labor.js'
export { AddLaborHandler } from './add-labor.js'

export type { UsePartCommand } from './use-part.js'
export { UsePartHandler } from './use-part.js'
