import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRepositories } from '@/db/hooks';
import { MAX_POSTING_CHARS, type AiResponse } from '@/domain/ai';
import { DEMO_POSTING } from '@/domain/demo';
import { ApplicationForm } from '@/features/applications/components/application-form';
import { useAiFeatureLock } from '@/features/ai/ai-feature-lock';
import { callAi } from '@/features/ai/client';
import { ensureAiConsent } from '@/features/ai/consent';
import { extractionToForm } from '@/features/ai/format';
import { isDemo } from '@/features/demo/mode';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { FormField } from '@/ui/form-field';
import { useGoBack } from '@/ui/navigation';

type Step =
  | { kind: 'input'; error?: string }
  | { kind: 'loading' }
  | { kind: 'review'; extraction: AiResponse<'stellenanzeige'> };

/** Anzeigentext einfügen → Claude füllt die Felder vor → prüfen und speichern */
export default function FromPostingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repositories = useRepositories();
  const goBack = useGoBack('/bewerbungen');
  const { ensureUnlocked } = useAiFeatureLock();
  // In der Web-Demo nur mit der Beispiel-Anzeige (der Server lehnt andere Texte ab)
  const [posting, setPosting] = useState(isDemo ? DEMO_POSTING : '');
  const [step, setStep] = useState<Step>({ kind: 'input' });

  async function analyze() {
    // Ohne eigenen Key weder Zustimmung noch Anfrage: erst der Hinweis auf die Einstellungen
    if (!(await ensureUnlocked())) return;
    if (!(await ensureAiConsent(repositories))) return;
    setStep({ kind: 'loading' });
    try {
      const extraction = await callAi('stellenanzeige', { posting });
      setStep({ kind: 'review', extraction });
    } catch (error) {
      setStep({ kind: 'input', error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (step.kind === 'review') {
    const { extraction } = step;
    return (
      <ApplicationForm
        header={
          <View style={[styles.summary, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.summaryLabel, { color: theme.accentSoftEyebrow }]}>
              ERKANNT – BITTE PRÜFEN
            </Text>
            <Text style={[styles.summaryText, { color: theme.accentSoftText }]}>
              {extraction.summary}
            </Text>
            {extraction.skills.length ? (
              <Text style={[styles.skills, { color: theme.accentSoftMuted }]}>
                {extraction.skills.join(' · ')}
              </Text>
            ) : null}
          </View>
        }
        initialValues={extractionToForm(extraction, posting)}
        submitLabel="Übernehmen"
        onCancel={() => setStep({ kind: 'input' })}
        onSubmit={(input) => {
          const { id } = repositories.applications.create(input);
          if (extraction.contactName) {
            repositories.details.saveContact(id, {
              name: extraction.contactName,
              ...(extraction.contactEmail ? { email: extraction.contactEmail } : {}),
            });
          }
          router.replace({ pathname: '/bewerbung/[id]', params: { id } });
        }}
      />
    );
  }

  const loading = step.kind === 'loading';
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.intro, { color: theme.textSecondary }]}>
        Füge den Text einer Stellenanzeige ein. Der KI-Assistent übernimmt Firma, Position, Ort,
        Arbeitsmodell, Gehalt und Ansprechperson – du prüfst alles, bevor es gespeichert wird.
      </Text>
      <FormField
        label="Text der Stellenanzeige"
        value={posting}
        onChangeText={setPosting}
        placeholder="Anzeige kopieren und hier einfügen"
        multiline
        autoFocus={!isDemo}
        editable={!isDemo}
        error={step.kind === 'input' ? step.error : undefined}
        hint={
          isDemo
            ? 'In der Demo mit einer Beispiel-Anzeige – in der App fügst du eigene Anzeigen ein.'
            : `${posting.length.toLocaleString('de-DE')} / ${MAX_POSTING_CHARS.toLocaleString('de-DE')} Zeichen`
        }
      />
      {loading ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.accentText} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Anzeige wird ausgewertet …
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.half}>
            <Button label="Abbrechen" variant="secondary" onPress={goBack} />
          </View>
          <View style={styles.half}>
            <Button
              label="Auswerten"
              icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
              disabled={posting.trim().length < 80}
              onPress={analyze}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 48,
  },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 14,
  },
  summary: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  skills: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
});
