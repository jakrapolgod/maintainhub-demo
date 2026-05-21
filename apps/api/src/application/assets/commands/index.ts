// ── Shared types ──────────────────────────────────────────────────────────────
export type { CommandContext } from './command.types.js'
export { writeAuditLog } from './command.types.js'

// ── Command + Handler pairs ───────────────────────────────────────────────────

export type { CreateAssetCommand } from './create-asset.js'
export { CreateAssetHandler } from './create-asset.js'

export type { UpdateAssetCommand } from './update-asset.js'
export { UpdateAssetHandler } from './update-asset.js'

export type { ChangeAssetStatusCommand } from './change-asset-status.js'
export { ChangeAssetStatusHandler } from './change-asset-status.js'

export type { DecommissionAssetCommand } from './decommission-asset.js'
export { DecommissionAssetHandler } from './decommission-asset.js'

export type { TransferAssetCommand } from './transfer-asset.js'
export { TransferAssetHandler } from './transfer-asset.js'

export type {
  BulkImportAssetsCommand,
  BulkImportRow,
  BulkImportResult,
} from './bulk-import-assets.js'
export { BulkImportAssetsHandler } from './bulk-import-assets.js'
