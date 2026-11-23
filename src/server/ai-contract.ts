// Fehler, Aufwand und Provider-Schnittstelle liegen im Paket; die Servermodule importieren sie
// weiterhin über diesen Pfad.
export { EFFORT, type AiService } from '@jobpilot-org/shared-ai/assistant';
export { AiApiError, AiIncompleteError, AiRefusalError } from '@jobpilot-org/shared-ai/errors';
