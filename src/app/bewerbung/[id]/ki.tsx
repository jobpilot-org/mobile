import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLive, useRepositories } from '@/db/hooks';
import { DRAFT_KINDS, DRAFT_LABELS, type AiResponse, type DraftKind } from '@/domain/ai';
import { NotFound } from '@/features/applications/components/not-found';
import { useAiFeatureLock } from '@/features/ai/ai-feature-lock';
import { callAi } from '@/features/ai/client';
import { ensureAiConsent } from '@/features/ai/consent';
import { isDemo } from '@/features/demo/mode';
import { FIT_LABELS, draftAsText, matchAsText, preparationAsText } from '@/features/ai/format';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { FormField } from '@/ui/form-field';
import { Section } from '@/ui/section';
import { SegmentedControl } from '@/ui/segmented-control';
import { showToast } from '@/ui/toast';

type Task = 'passung' | 'vorbereitung' | 'entwurf';
const TITLES: Record<Task, string> = {
  passung: 'Passt die Stelle zu dir?',
  vorbereitung: 'Gesprächsvorbereitung',
  entwurf: 'Text entwerfen',
};

type Result =
  | { kind: 'result'; task: 'passung'; data: AiResponse<'passung'> }
  | { kind: 'result'; task: 'vorbereitung'; data: AiResponse<'vorbereitung'> }
  | { kind: 'result'; task: 'entwurf'; data: AiResponse<'entwurf'> };

const isTask = (value: unknown): value is Task =>
  value === 'passung' || value === 'vorbereitung' || value === 'entwurf';

export default function AssistantScreen() {
  const { id, aufgabe } = useLocalSearchParams<{ id: string; aufgabe?: string }>();
  const task: Task = isTask(aufgabe) ? aufgabe : 'passung';
  const theme = useTheme();
  const router = useRouter();
  const repositories = useRepositories();
  const { ensureUnlocked } = useAiFeatureLock();
  const data = useLive(
    ({ applications, details, settings }) => ({
      application: applications.get(id),
      contact: details.contacts(id)[0],
      profile: settings.get('profile.text') ?? '',
    }),
    ['applications', 'contacts', 'settings'],
    [id],
  );
  const [kind, setKind] = useState<DraftKind>('anschreiben');
  const [context, setContext] = useState('');
  const [postingDraft, setPostingDraft] = useState('');
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | Result
  >({ kind: 'idle' });

  const { application, contact, profile } = data;
  if (!application) return <NotFound />;
  const posting = application.jobDescription;
  const needsPosting = task !== 'entwurf' && !posting;
  const needsProfile = task === 'passung' && !profile.trim();

  async function run() {
    if (!application) return;
    // Auch direkt geöffnet darf der Screen ohne bestätigten Key weder Zustimmung noch Anfrage starten
    if (!(await ensureUnlocked())) return;
    if (!(await ensureAiConsent(repositories))) return;
    setState({ kind: 'loading' });
    const base = { company: application.company, role: application.role };
    const withProfile = profile.trim() ? { profile } : {};
    try {
      if (task === 'passung') {
        setState({
          kind: 'result',
          task,
          data: await callAi('passung', { posting: posting ?? '', profile }),
        });
      } else if (task === 'vorbereitung') {
        setState({
          kind: 'result',
          task,
          data: await callAi('vorbereitung', { ...base, posting: posting ?? '', ...withProfile }),
        });
      } else {
        setState({
          kind: 'result',
          task,
          data: await callAi('entwurf', {
            ...base,
            kind,
            ...withProfile,
            ...(posting ? { posting } : {}),
            ...(contact ? { contactName: contact.name } : {}),
            ...(context.trim() ? { context } : {}),
          }),
        });
      }
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  const resultText =
    state.kind === 'result'
      ? state.task === 'passung'
        ? matchAsText(state.data)
        : state.task === 'vorbereitung'
          ? preparationAsText(state.data)
          : draftAsText(state.data)
      : '';

  function saveAsNote() {
    const title = task === 'entwurf' ? DRAFT_LABELS[kind] : TITLES[task];
    repositories.details.addNote(id, `${title}\n\n${resultText}`);
    showToast({ message: 'Als Notiz gespeichert' });
  }

  async function copy() {
    await Clipboard.setStringAsync(resultText);
    showToast({ message: 'In die Zwischenablage kopiert' });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: TITLES[task] }} />
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {application.role} bei {application.company}
      </Text>

      {needsPosting ? (
        <View style={styles.block}>
          <Text style={[styles.hint, { color: theme.text }]}>
            Dafür braucht der Assistent den Text der Stellenanzeige.
          </Text>
          <FormField
            label="Text der Stellenanzeige"
            value={postingDraft}
            onChangeText={setPostingDraft}
            placeholder="Anzeige kopieren und hier einfügen"
            multiline
          />
          <Button
            label="Anzeigentext speichern"
            variant="secondary"
            disabled={postingDraft.trim().length < 80}
            onPress={() => repositories.applications.setJobDescription(id, postingDraft)}
          />
        </View>
      ) : null}

      {needsProfile ? (
        <View style={styles.block}>
          <Text style={[styles.hint, { color: theme.text }]}>
            Für den Abgleich braucht der Assistent dein Profil – zum Beispiel deinen Lebenslauf als
            Text. Es bleibt auf deinem Gerät und wird nur für diese Anfrage mitgeschickt.
          </Text>
          <Button
            label="Profil in den Einstellungen anlegen"
            variant="secondary"
            onPress={() => router.push('/einstellungen')}
          />
        </View>
      ) : null}

      {task === 'entwurf' ? (
        <View style={styles.block}>
          <SegmentedControl
            label="Was soll entstehen?"
            options={DRAFT_KINDS.map((value) => ({ value, label: DRAFT_LABELS[value] }))}
            value={kind}
            onChange={setKind}
          />
          {/* Freier Text ist in der Demo gesperrt – der Server nimmt dort nur Demo-Inhalte an */}
          {isDemo ? null : (
            <FormField
              label="Worauf soll der Text eingehen? (optional)"
              value={context}
              onChangeText={setContext}
              placeholder={
                kind === 'dankeschoen'
                  ? 'z. B. Gespräch über die Migration auf Next.js, nettes Team'
                  : 'z. B. Wechselmotivation, frühester Starttermin'
              }
              multiline
            />
          )}
        </View>
      ) : null}

      {!needsPosting && !needsProfile ? (
        state.kind === 'loading' ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.accentText} />
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Einen Moment, der Assistent arbeitet …
            </Text>
          </View>
        ) : (
          <Button
            label={state.kind === 'result' ? 'Neu erstellen' : 'Erstellen'}
            icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            variant={state.kind === 'result' ? 'secondary' : 'primary'}
            onPress={run}
          />
        )
      ) : null}

      {state.kind === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {state.message}
        </Text>
      ) : null}

      {state.kind === 'result' ? (
        <>
          <ResultView result={state} />
          <View style={styles.actions}>
            <View style={styles.half}>
              <Button label="Kopieren" variant="secondary" onPress={copy} />
            </View>
            <View style={styles.half}>
              <Button label="Als Notiz speichern" onPress={saveAsNote} />
            </View>
          </View>
          <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
            Erstellt mit einem KI-Modell – bitte vor dem Verwenden prüfen.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function ResultView({ result }: { result: Result }) {
  const theme = useTheme();
  const text = { color: theme.text };
  const muted = { color: theme.textSecondary };

  if (result.task === 'passung') {
    const { fit, summary, matches, gaps, talkingPoints } = result.data;
    return (
      <>
        <View style={[styles.fit, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.fitLabel, { color: theme.accentSoftText }]}>{FIT_LABELS[fit]}</Text>
          <Text style={[styles.body, { color: theme.accentSoftText }]}>{summary}</Text>
        </View>
        {[
          { title: 'Das passt', items: matches },
          { title: 'Lücken', items: gaps },
          { title: 'Im Gespräch betonen', items: talkingPoints },
        ].map(({ title, items }) =>
          items.length ? (
            <Section key={title} title={title} plain>
              {items.map((item) => (
                <Text key={item} style={[styles.body, text]}>
                  • {item}
                </Text>
              ))}
            </Section>
          ) : null,
        )}
      </>
    );
  }

  if (result.task === 'vorbereitung') {
    return (
      <>
        <Section title="Mögliche Fragen" plain>
          {result.data.questions.map((q, index) => (
            <View
              key={q.question}
              style={[
                styles.card,
                { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
              ]}>
              <Text style={[styles.question, text]}>
                {index + 1}. {q.question}
              </Text>
              <Text style={[styles.small, muted]}>{q.why}</Text>
              <Text style={[styles.body, text]}>→ {q.hint}</Text>
            </View>
          ))}
        </Section>
        <Section title="Deine Rückfragen" plain>
          {result.data.questionsToAsk.map((question) => (
            <Text key={question} style={[styles.body, text]}>
              • {question}
            </Text>
          ))}
        </Section>
      </>
    );
  }

  return (
    <Section title="Entwurf" plain>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
        ]}>
        <Text selectable style={[styles.question, text]}>
          Betreff: {result.data.subject}
        </Text>
        <Text selectable style={[styles.body, text]}>
          {result.data.body}
        </Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 48,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 18,
  },
  block: {
    marginBottom: 18,
    gap: 8,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  fit: {
    borderRadius: 12,
    padding: 14,
    marginTop: 22,
    gap: 4,
  },
  fitLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginBottom: 8,
  },
  question: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  small: {
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  half: {
    flex: 1,
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
});
