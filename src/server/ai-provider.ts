import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import type { AiService } from '@/server/ai-contract';
import { createAnthropicService } from '@/server/anthropic-service';
import { OPENAI_MODEL, createOpenAiService } from '@/server/openai-service';

/** Die gelesenen Variablen; Tests reichen ein eigenes Objekt statt `process.env` */
type AiEnv = Record<string, string | undefined>;

/**
 * Baut aus der Server-Konfiguration den passenden KI-Service. Im angemeldeten Betrieb ersetzt
 * `apiKey` den Server-Key durch den Schlüssel des jeweiligen Nutzers aus dem Supabase Vault.
 * null bedeutet: kein Provider eingerichtet – der Assistent antwortet mit 503,
 * die App und der Server starten trotzdem normal.
 */
export function createProviderFromEnv(
  env: AiEnv = process.env,
  apiKey?: string,
): AiService | null {
  const provider = env.AI_PROVIDER?.trim() || 'anthropic';

  if (provider === 'anthropic') {
    const resolvedKey = (apiKey === undefined ? env.ANTHROPIC_API_KEY : apiKey)?.trim();
    if (!resolvedKey) return null;
    return createAnthropicService(new Anthropic({ apiKey: resolvedKey }));
  }

  if (provider === 'openai') {
    const resolvedKey = (apiKey === undefined ? env.OPENAI_API_KEY : apiKey)?.trim();
    if (!resolvedKey) return null;
    // baseURL zeigt auf OpenAI-kompatible Dienste; ohne Angabe gilt der OpenAI-Standard
    const baseURL = env.OPENAI_BASE_URL?.trim() || undefined;
    const model = env.OPENAI_MODEL?.trim() || OPENAI_MODEL;
    return createOpenAiService(new OpenAI({ apiKey: resolvedKey, baseURL }), model);
  }

  console.error(
    `KI-Konfiguration: Unbekannter AI_PROVIDER "${provider}". Erlaubt sind "anthropic" (Standard) und "openai".`,
  );
  return null;
}
