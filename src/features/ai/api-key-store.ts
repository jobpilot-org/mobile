import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseClient } from '@/features/auth/supabase';

// Zugriff auf den eigenen Anthropic-Key: Die App liest nur die Metadatenzeile des angemeldeten
// Nutzers und schreibt über die RPCs von Supabase, die die Eigentümerschaft aus `auth.uid()`
// ziehen. Der Key selbst liegt verschlüsselt im Vault und ist für die App nicht lesbar.

/** Zustand des hinterlegten Keys – nur Metadaten, nie der Key */
export type ApiKeyStatus = {
  configured: boolean;
  /** Zeitpunkt des letzten Speicherns oder Ersetzens; `null`, solange kein Key hinterlegt ist */
  updatedAt: string | null;
};

export const NO_API_KEY: ApiKeyStatus = { configured: false, updatedAt: null };

/** Fehler mit einem Text, den die Einstellungen direkt anzeigen können */
export class ApiKeyStoreError extends Error {}

/**
 * Vor dem Speichern wird nur geprüft, ob überhaupt etwas eingegeben wurde und ob Leerraum darin
 * steckt. Key-Formate können sich ändern; ob der Key gültig ist, zeigt erst die nächste Anfrage an
 * Claude.
 */
const apiKeySchema = z
  .string()
  .trim()
  .min(1, 'Bitte gib deinen Anthropic-API-Key ein.')
  .refine((value) => !/\s/.test(value), 'Der Anthropic-API-Key darf keine Leerzeichen enthalten.');

/** Fehlertext zur Eingabe oder `null`, wenn sie gespeichert werden kann */
export function apiKeyInputError(input: string): string | null {
  const parsed = apiKeySchema.safeParse(input);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Ungültiger API-Key.');
}

type SettingsRow = { updated_at: string };

function toStatus(row: SettingsRow | null): ApiKeyStatus {
  return row ? { configured: true, updatedAt: row.updated_at } : NO_API_KEY;
}

/** Liest die eigene Metadatenzeile; RLS liefert fremde Zeilen nicht */
export async function loadApiKeyStatus(
  client: SupabaseClient = getSupabaseClient(),
): Promise<ApiKeyStatus> {
  const { data, error } = await client.from('ai_api_keys').select('updated_at').maybeSingle();
  if (error) {
    throw new ApiKeyStoreError('Der Status deines API-Keys konnte nicht geladen werden.');
  }
  return toStatus(data as SettingsRow | null);
}

/** Speichert einen neuen Key oder ersetzt den bisherigen des angemeldeten Nutzers */
export async function saveApiKey(
  input: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<ApiKeyStatus> {
  const parsed = apiKeySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiKeyStoreError(
      parsed.error.issues[0]?.message ?? 'Das sieht nicht nach einem API-Key aus.',
    );
  }

  const { data, error } = await client.rpc('save_ai_api_key', { api_key: parsed.data });
  if (error) {
    throw new ApiKeyStoreError(
      'Der API-Key konnte nicht gespeichert werden. Bitte versuche es noch einmal.',
    );
  }

  const [row] = (data ?? []) as SettingsRow[];
  return toStatus(row ?? null);
}

/** Löscht den Key und die Metadaten des angemeldeten Nutzers, samt Vault-Secret */
export async function deleteApiKey(client: SupabaseClient = getSupabaseClient()): Promise<void> {
  const { error } = await client.rpc('delete_ai_api_key');
  if (error) {
    throw new ApiKeyStoreError(
      'Der API-Key konnte nicht gelöscht werden. Bitte versuche es noch einmal.',
    );
  }
}
