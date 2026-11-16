import { useRouter } from 'expo-router';

import { useAiAccess } from '@/features/ai/ai-access';
import { confirm } from '@/ui/dialogs';

// Eine Sperre für alle KI-Funktionen: Die Einstiegspunkte bleiben sichtbar, erklären bei einem
// bestätigt fehlenden Key die Voraussetzung und führen auf Wunsch in die Einstellungen. Ein
// unbekannter Status (Laden, Ladefehler) sperrt nichts, dort bleibt alles wie bisher.

export const AI_KEY_MISSING_TITLE = 'KI-API-Key fehlt';
export const AI_KEY_MISSING_MESSAGE =
  'Der KI-Assistent braucht einen eigenen API-Key. Du kannst ihn unter Einstellungen → KI-Assistent hinterlegen.';
export const AI_KEY_MISSING_CONFIRM = 'Einstellungen öffnen';
/** Hinweis für Screenreader an gesperrten Einstiegspunkten */
export const AI_KEY_MISSING_HINT = 'KI-API-Key in den Einstellungen hinterlegen';

export type AiFeatureLock = {
  /** Sperrt nur ein bestätigt fehlender Key, nicht das Laden und nicht ein Ladefehler */
  locked: boolean;
  /**
   * `true`, wenn die KI-Aktion starten darf. Ist der Key bestätigt missing, erklärt ein Dialog die
   * Voraussetzung und öffnet die Einstellungen erst nach Bestätigung.
   */
  ensureUnlocked: () => Promise<boolean>;
};

export function useAiFeatureLock(): AiFeatureLock {
  const { state } = useAiAccess();
  const router = useRouter();
  const locked = state === 'missing';

  async function ensureUnlocked() {
    if (!locked) return true;
    const openSettings = await confirm({
      title: AI_KEY_MISSING_TITLE,
      message: AI_KEY_MISSING_MESSAGE,
      confirmLabel: AI_KEY_MISSING_CONFIRM,
    });
    if (openSettings) router.push('/einstellungen');
    return false;
  }

  return { locked, ensureUnlocked };
}
