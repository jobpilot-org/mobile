// Gemeinsame Verträge liegen im Paket; der Pfad @/domain/ai bleibt für die Importe der App bestehen.
export {
  AI_ACTIONS,
  DRAFT_KINDS,
  DRAFT_LABELS,
  MAX_POSTING_CHARS,
  MAX_PROFILE_CHARS,
  errorSchema,
  requestSchemas,
  responseSchemas,
  type AiAction,
  type AiRequest,
  type AiResponse,
  type DraftKind,
} from '@jobpilot-org/shared-ai/assistant';
