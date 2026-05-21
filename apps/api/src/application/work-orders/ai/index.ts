// ── Shared AI types and utilities ─────────────────────────────────────────────
export {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  noopMonitoring,
  draftWorkOrderSchema,
  failureAnalysisSchema,
  extractText,
  parseAiJson,
  recordUsage,
} from './ai.types.js'

export type {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessagesCreate,
  MonitoringPort,
  TokenUsage,
  AiErrorCode,
  DraftWorkOrderAiResponse,
  FailureAnalysisAiResponse,
} from './ai.types.js'

// ── Use cases ─────────────────────────────────────────────────────────────────
export type { DraftWorkOrderInput, DraftWorkOrderDraft } from './draft-work-order-from-nl.js'
export { DraftWorkOrderFromNLUseCase } from './draft-work-order-from-nl.js'

export type { AnalyzeFailureInput, FailureAnalysisResult } from './analyze-failure.js'
export { AnalyzeFailureUseCase } from './analyze-failure.js'

export type {
  GenerateWorkInstructionsInput,
  WorkInstructionsResult,
} from './generate-work-instructions.js'
export { GenerateWorkInstructionsUseCase } from './generate-work-instructions.js'
