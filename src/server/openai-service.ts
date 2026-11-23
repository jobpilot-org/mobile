// Der OpenAI-Aufruf liegt im Paket; die Route baut den Client mit dem Key des Nutzers und dem
// Modell aus der Server-Konfiguration.
export { OPENAI_MODEL, createOpenAiService } from '@jobpilot-org/shared-ai/providers/openai';
