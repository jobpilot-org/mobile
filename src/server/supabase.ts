import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-Zugang der API-Routen. Beide Werte sind öffentlich und stehen auch in der App; der
 * Server schickt zusätzlich das Access-Token des Aufrufers mit, damit Postgres die Anfrage als
 * `authenticated` ausführt. Ein Schlüssel mit Service-Rolle wird dafür nicht mehr gebraucht.
 */

/**
 * Client für genau eine Anfrage: Der `Authorization`-Header trägt das Token des Aufrufers, damit
 * die RPCs und RLS als dieser Nutzer laufen. Nichts wird zwischengespeichert – jedes Token gehört
 * zu einem eigenen Client.
 */
export function createServerSupabaseClient(accessToken: string): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase ist auf dem Server nicht konfiguriert: EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env eintragen.',
    );
  }
  return createClient(url, publishableKey, {
    auth: {
      // Der Server meldet sich nicht selbst an; jedes Token kommt einzeln mit der Anfrage
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
