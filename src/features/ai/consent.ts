import type { Repositories } from '@/db/repositories';
import { confirm } from '@/ui/dialogs';

/**
 * Vor der ersten Nutzung erklären, was an den KI-Dienst geht. Die Zustimmung wird gespeichert
 * und lässt sich in den Einstellungen zurücknehmen.
 */
export async function ensureAiConsent({ settings }: Repositories): Promise<boolean> {
  if (settings.get('ai.consent') === 'yes') return true;
  const accepted = await confirm({
    title: 'KI-Assistent verwenden?',
    message:
      'Für diese Funktion werden der Text der Stellenanzeige und – falls nötig – dein Profil an den jobpilot-Server gesendet und dort von einem KI-Modell verarbeitet. Gespeichert wird das Ergebnis nur auf deinem Gerät. Bitte keine Daten einfügen, die du nicht teilen möchtest.',
    confirmLabel: 'Einverstanden',
  });
  if (accepted) settings.set('ai.consent', 'yes');
  return accepted;
}

export function revokeAiConsent({ settings }: Repositories) {
  settings.set('ai.consent', 'no');
}
