import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { sessionStorage } from '@/features/auth/session-storage';

/**
 * Supabase-Projekt aus der Umgebung: die Werte stehen in `mobile/.env` (Cloud) und lassen sich für
 * die lokale Instanz in `mobile/.env.local` überschreiben. Ein Projektwechsel braucht keine
 * Code-Änderung, nur neue Werte.
 */
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

let client: SupabaseClient | null = null;

/**
 * Ein Client für die ganze App, beim ersten Zugriff aus der Umgebung gebaut – so bricht ein Build
 * ohne Supabase-Konfiguration (etwa die Demo) nicht schon beim Import ab.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase ist nicht konfiguriert: EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env eintragen (oder in mobile/.env.local für die lokale Instanz).',
    );
  }
  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Anmeldung nur per E-Mail und Passwort, es kommen keine Tokens über die URL zurück
      detectSessionInUrl: false,
    },
  });
  return client;
}
