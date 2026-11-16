import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLive, useRepositories } from '@/db/hooks';
import { MAX_PROFILE_CHARS } from '@/domain/ai';
import { ApiKeySettings } from '@/features/ai/api-key-settings';
import { revokeAiConsent } from '@/features/ai/consent';
import { isDemo } from '@/features/demo/mode';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { FormField } from '@/ui/form-field';
import { showToast } from '@/ui/toast';

/** Profil für Abgleich und Anschreiben; Zustimmung zur Übermittlung an den KI-Dienst */
export function AiSettings() {
  const theme = useTheme();
  const repositories = useRepositories();
  const { saved, consent } = useLive(
    ({ settings }) => ({
      saved: settings.get('profile.text') ?? '',
      consent: settings.get('ai.consent') === 'yes',
    }),
    ['settings'],
  );
  const [draft, setDraft] = useState(saved);
  const tooLong = draft.length > MAX_PROFILE_CHARS;

  return (
    <View style={styles.body}>
      <FormField
        label="Dein Profil"
        value={draft}
        onChangeText={setDraft}
        placeholder="Lebenslauf oder Kurzprofil als Text: Erfahrung, Stationen, Technologien, Wünsche"
        multiline
        editable={!isDemo}
        error={
          tooLong ? `Höchstens ${MAX_PROFILE_CHARS.toLocaleString('de-DE')} Zeichen` : undefined
        }
        hint={
          isDemo
            ? 'In der Demo ist ein Beispielprofil hinterlegt.'
            : 'Bleibt auf deinem Gerät. Für Abgleich und Anschreiben wird es mit der jeweiligen Anfrage an den jobpilot-Server gesendet und von dort zur Verarbeitung durch ein KI-Modell an den konfigurierten externen KI-Anbieter weitergeleitet.'
        }
      />
      <View style={styles.row}>
        <Button
          label="Profil speichern"
          variant="secondary"
          compact
          disabled={draft === saved || tooLong}
          onPress={() => {
            repositories.settings.set('profile.text', draft.trim());
            showToast({ message: 'Profil gespeichert' });
          }}
        />
      </View>
      <View style={[styles.consent, { borderTopColor: theme.border }]}>
        <Text style={[styles.consentText, { color: theme.textSecondary }]}>
          {consent
            ? 'Du hast zugestimmt, dass Anzeigentexte und Profil zur Auswertung über den jobpilot-Server an den konfigurierten externen KI-Anbieter gesendet werden.'
            : 'Vor der ersten Nutzung fragt jobpilot, ob Texte über den jobpilot-Server an den konfigurierten externen KI-Anbieter gesendet werden dürfen.'}
        </Text>
        {consent ? (
          <Button
            label="Zustimmung zurücknehmen"
            variant="secondary"
            compact
            onPress={() => revokeAiConsent(repositories)}
          />
        ) : null}
      </View>
      {/* Eigener Key des Nutzers; Profil und Zustimmung bleiben davon unberührt lokal */}
      <ApiKeySettings />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 15,
  },
  row: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  consent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  consentText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
