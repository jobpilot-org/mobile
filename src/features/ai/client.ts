import {
  errorSchema,
  responseSchemas,
  type AiAction,
  type AiRequest,
  type AiResponse,
} from '@/domain/ai';
import { getSupabaseClient } from '@/features/auth/supabase';
import { isDemo } from '@/features/demo/mode';

// Ruft die KI-Routen des eigenen Servers auf. Relative URLs gehen in der Entwicklung an den
// Dev-Server; für die veröffentlichte App setzt `origin` im expo-router-Plugin die Adresse.

export class AiRequestError extends Error {}

/** Access-Token des angemeldeten Nutzers; `null` heißt: Anfrage ohne Anmeldung (Demo) */
export type AccessTokenProvider = () => Promise<string | null>;

/** Token der aktuellen Supabase-Session; die Demo kennt keine Anmeldung */
async function currentAccessToken(): Promise<string | null> {
  if (isDemo) return null;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    // Ohne Supabase-Konfiguration geht die Anfrage ohne Token raus; der Server antwortet mit 401
    return null;
  }
}

export async function callAi<A extends AiAction>(
  action: A,
  payload: AiRequest<A>,
  fetchImpl: typeof fetch = fetch,
  accessToken: AccessTokenProvider = currentAccessToken,
): Promise<AiResponse<A>> {
  const token = await accessToken().catch(() => null);

  let response: Response;
  try {
    response = await fetchImpl(`/api/ki/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Der Server ermittelt den Nutzer nur aus diesem Token, nie aus dem Body
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AiRequestError('Keine Verbindung zum KI-Assistenten. Bist du online?');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new AiRequestError(parsed.success ? parsed.data.error : 'Das hat leider nicht geklappt.');
  }

  // Auch die eigene API wird geprüft: Die App verlässt sich nur auf gültige Daten
  const parsed = responseSchemas[action].safeParse(body);
  if (!parsed.success) throw new AiRequestError('Die Antwort hatte ein unerwartetes Format.');
  return parsed.data as AiResponse<A>;
}
