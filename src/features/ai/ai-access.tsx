import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { loadApiKeyStatus, type ApiKeyStatus } from '@/features/ai/api-key-store';
import { isDemo } from '@/features/demo/mode';

// Eine Quelle für die Frage, ob der angemeldete Nutzer KI-Funktionen nutzen kann: Die Einstellungen
// lesen und schreiben den Key, alle KI-Einstiegspunkte entscheiden anhand desselben Zustands.
// Gesperrt ist nur `missing` – während des Ladens und nach einem Ladefehler bleibt alles wie bisher.

/** `missing` ist bestätigt, `error` heißt unbekannt und sperrt deshalb nichts */
export type AiAccessState = 'loading' | 'configured' | 'missing' | 'error';

type AiAccessValue = {
  state: AiAccessState;
  /** Metadaten des Keys für die Einstellungen; `null`, solange sie unbekannt sind */
  status: ApiKeyStatus | null;
  /** Lädt den Status erneut, etwa nach einem Ladefehler in den Einstellungen */
  retry: () => void;
  /** Ergebnis von Speichern oder Löschen, damit alle Bildschirme sofort mitziehen */
  applyStatus: (status: ApiKeyStatus) => void;
};

const AiAccessContext = createContext<AiAccessValue | null>(null);

/** In der Demo zahlt der Server; es gibt keinen eigenen Key, die KI bleibt verfügbar */
const DEMO_STATUS: ApiKeyStatus = { configured: true, updatedAt: null };

export function AiAccessProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AiAccessState>(isDemo ? 'configured' : 'loading');
  const [status, setStatus] = useState<ApiKeyStatus | null>(isDemo ? DEMO_STATUS : null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Die Demo fragt nie nach dem Key des Nutzers
    if (isDemo) return;
    let active = true;

    loadApiKeyStatus().then(
      (next) => {
        if (!active) return;
        setStatus(next);
        setState(next.configured ? 'configured' : 'missing');
      },
      () => {
        if (!active) return;
        setStatus(null);
        setState('error');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const applyStatus = useCallback((next: ApiKeyStatus) => {
    setStatus(next);
    setState(next.configured ? 'configured' : 'missing');
  }, []);

  const value = useMemo(
    () => ({ state, status, retry, applyStatus }),
    [state, status, retry, applyStatus],
  );
  return <AiAccessContext.Provider value={value}>{children}</AiAccessContext.Provider>;
}

/** Darf nur unterhalb des angemeldeten App-Gerüsts stehen; davor gibt es keine Session */
export function useAiAccess(): AiAccessValue {
  const value = useContext(AiAccessContext);
  if (!value) {
    throw new Error('useAiAccess must be used within an AiAccessProvider');
  }
  return value;
}
