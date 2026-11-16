import type { SupabaseClient } from '@supabase/supabase-js';

import { createServerSupabaseClient } from '@/server/supabase';

/**
 * Ergebnis der Ausweisung einer KI-Anfrage. Jeder Fall außer `ok` braucht eine andere Antwort:
 * fehlende Anmeldung, fehlender Key des Nutzers und ein vorübergehend nicht erreichbarer Dienst.
 */
export type CredentialResolution =
  | { status: 'ok'; userId: string; apiKey: string }
  /** Kein Bearer-Token oder ein Token, das Supabase nicht kennt */
  | { status: 'unauthorized' }
  /** Angemeldet, aber noch kein eigener Anthropic-Key hinterlegt */
  | { status: 'missing-key' }
  /** Supabase oder Vault antwortet nicht – kein Fehler des Nutzers */
  | { status: 'unavailable' };

/** Weist eine Anfrage aus und liefert den Anthropic-Key des angemeldeten Nutzers */
export type CredentialResolver = (request: Request) => Promise<CredentialResolution>;

/** Access-Token aus dem `Authorization`-Header; ein JWT enthält keinen Leerraum */
export function bearerToken(request: Request): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

/**
 * Prüft das Token bei Supabase und liest damit den Key des Aufrufers: Der Client trägt das Token,
 * die RPC `get_ai_api_key()` entscheidet allein über `auth.uid()`, welcher Key zurückkommt. Der Key
 * wird nie geloggt und nur an den Aufrufer dieser Funktion gegeben.
 */
export function createCredentialResolver(
  clientForToken: (accessToken: string) => SupabaseClient,
): CredentialResolver {
  return async (request) => {
    const token = bearerToken(request);
    if (!token) return { status: 'unauthorized' };

    // Fehlende Server-Konfiguration wirft hier und landet als 503 beim Aufrufer
    const client = clientForToken(token);

    // Die Identität stammt nur aus dem bei Supabase geprüften Token, nie aus dem Anfrage-Body
    let userId: string | undefined;
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error)
        return isRejectedToken(error.status)
          ? { status: 'unauthorized' }
          : { status: 'unavailable' };
      userId = data.user?.id;
    } catch {
      return { status: 'unavailable' };
    }
    if (!userId) return { status: 'unauthorized' };

    const { data: apiKey, error: vaultError } = await client.rpc('get_ai_api_key');
    if (vaultError) {
      console.error('Anthropic-Key aus dem Supabase Vault nicht lesbar:', vaultError.message);
      return { status: 'unavailable' };
    }
    if (typeof apiKey !== 'string' || apiKey === '') return { status: 'missing-key' };

    return { status: 'ok', userId, apiKey };
  };
}

/** 4xx heißt: Dieses Token gilt nicht. Alles andere (5xx, Netzwerk, Status 0) ist ein Ausfall. */
function isRejectedToken(status: number | undefined) {
  return status !== undefined && status >= 400 && status < 500;
}

let defaultResolver: CredentialResolver | undefined;

/** Standard-Auflösung mit dem Client je Token, beim ersten Aufruf gebaut */
export function resolveAiCredentials(request: Request): Promise<CredentialResolution> {
  defaultResolver ??= createCredentialResolver(createServerSupabaseClient);
  return defaultResolver(request);
}
