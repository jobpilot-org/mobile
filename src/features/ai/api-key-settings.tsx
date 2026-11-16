import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAiAccess } from '@/features/ai/ai-access';
import {
  apiKeyInputError,
  ApiKeyStoreError,
  deleteApiKey,
  NO_API_KEY,
  saveApiKey,
  type ApiKeyStatus,
} from '@/features/ai/api-key-store';
import { isDemo } from '@/features/demo/mode';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { confirm, notify } from '@/ui/dialogs';
import { FormField } from '@/ui/form-field';
import { showToast } from '@/ui/toast';

const LOAD_FAILED = 'Der Status deines API-Keys konnte nicht geladen werden.';
const SAVE_FAILED = 'Der API-Key konnte nicht gespeichert werden. Bitte versuche es noch einmal.';
const DELETE_FAILED_TITLE = 'Löschen hat nicht geklappt';
const DELETE_FAILED_MESSAGE = 'Bitte prüfe deine Verbindung und versuche es noch einmal.';

const updatedAtFormat = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function statusText(status: ApiKeyStatus | null) {
  if (!status) return 'Status wird geladen …';
  if (!status.configured || !status.updatedAt) return 'Noch kein eigener Key hinterlegt.';
  return `Eigener Key hinterlegt · zuletzt geändert am ${updatedAtFormat.format(
    new Date(status.updatedAt),
  )}`;
}

/** Eigener Anthropic-Key; in der Demo zahlt der Server und es gibt nichts zu verwalten */
export function ApiKeySettings() {
  if (isDemo) return null;
  return <ApiKeyForm />;
}

function ApiKeyForm() {
  const theme = useTheme();
  // Status und Ladefehler kommen aus der gemeinsamen KI-Freigabe; Speichern und Löschen melden
  // ihr Ergebnis dorthin zurück, damit die KI-Funktionen sofort mitziehen
  const { state, status, retry, applyStatus } = useAiAccess();
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);

  async function save() {
    const error = apiKeyInputError(draft);
    setInputError(error);
    if (error) return;

    setPending('save');
    try {
      applyStatus(await saveApiKey(draft));
      // Der eingegebene Key wird nicht behalten: Gespeicherte Keys zeigt die App nie wieder an
      setDraft('');
      showToast({ message: 'API-Key gespeichert' });
    } catch (saveError) {
      setInputError(saveError instanceof ApiKeyStoreError ? saveError.message : SAVE_FAILED);
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    const confirmed = await confirm({
      title: 'API-Key löschen?',
      message:
        'Dein gespeicherter Anthropic-API-Key wird gelöscht. Der KI-Assistent funktioniert erst wieder, wenn du einen neuen Key hinterlegst.',
      confirmLabel: 'Löschen',
    });
    if (!confirmed) return;

    setPending('delete');
    try {
      await deleteApiKey();
      applyStatus(NO_API_KEY);
      setInputError(null);
      showToast({ message: 'API-Key gelöscht' });
    } catch {
      notify(DELETE_FAILED_TITLE, DELETE_FAILED_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  if (state === 'error') {
    return (
      <View style={[styles.body, { borderTopColor: theme.border }]}>
        <Text style={[styles.caption, { color: theme.textSecondary }]}>{LOAD_FAILED}</Text>
        <View style={styles.row}>
          <Button label="Erneut versuchen" variant="secondary" compact onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.body, { borderTopColor: theme.border }]}>
      <Text style={[styles.caption, { color: theme.textSecondary }]}>{statusText(status)}</Text>
      <FormField
        label="Anthropic-API-Key"
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setInputError(null);
        }}
        placeholder="Key einfügen"
        autoCapitalize="none"
        autoComplete="off"
        secureTextEntry
        editable={pending === null}
        error={inputError ?? undefined}
        hint="Wird verschlüsselt im Supabase Vault gespeichert und nur auf dem Server entschlüsselt. Ein gespeicherter Key lässt sich nicht mehr anzeigen."
      />
      <View style={styles.row}>
        <Button
          label={
            pending === 'save'
              ? 'Speichern …'
              : status?.configured
                ? 'Key ersetzen'
                : 'Key speichern'
          }
          compact
          disabled={!draft.trim() || pending !== null || status === null}
          onPress={save}
        />
        {status?.configured ? (
          <Button
            label={pending === 'delete' ? 'Löschen …' : 'Key löschen'}
            variant="danger"
            compact
            disabled={pending !== null}
            onPress={remove}
          />
        ) : null}
      </View>
      <Text style={[styles.caption, { color: theme.textSecondary }]}>
        Beim Speichern prüft die App nur die Form des Keys. Ob er gilt, zeigt sich beim nächsten
        Aufruf des Assistenten – ein abgelehnter Key lässt sich hier ersetzen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    marginTop: -4,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
  },
});
