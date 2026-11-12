import type { AuthError, Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { getSupabaseClient } from '@/features/auth/supabase';
import { isDemo } from '@/features/demo/mode';

type AuthContextValue = {
  /** Angemeldeter Nutzer, `null` solange niemand angemeldet ist */
  session: Session | null;
  /** Solange die gespeicherte Session gelesen wird, bleibt der Splash stehen */
  isLoading: boolean;
  /** Gibt den Fehler von Supabase zurück, damit die Anmeldemaske ihn übersetzen kann */
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  /** Die Session verschwindet über den Listener, der Aufrufer muss nichts zurücksetzen */
  signOut: () => Promise<AuthError | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session und Anmeldeaktionen für die ganze App. In der Demo gibt es keine Anmeldung, dort wird
 * kein Client gebaut – `signIn` und `signOut` ruft dort niemand auf.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => (isDemo ? null : getSupabaseClient()));
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(client !== null);

  useEffect(() => {
    if (!client) return;
    let active = true;

    // Zuerst die gespeicherte Session, danach hält der Listener den Zustand aktuell – auch wenn
    // die Session abläuft oder anderswo abgemeldet wird
    client.auth.getSession().then(
      ({ data }) => {
        if (!active) return;
        setSession(data.session);
        setIsLoading(false);
      },
      () => {
        if (!active) return;
        setIsLoading(false);
      },
    );

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  async function signIn(email: string, password: string): Promise<AuthError | null> {
    if (!client) throw new Error('Anmelden gibt es in der Demo nicht.');
    // Die Session setzt der Listener; hier zählt nur, ob Supabase den Versuch abgelehnt hat
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error;
  }

  async function signOut(): Promise<AuthError | null> {
    if (!client) throw new Error('Abmelden gibt es in der Demo nicht.');
    const { error } = await client.auth.signOut();
    return error;
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
