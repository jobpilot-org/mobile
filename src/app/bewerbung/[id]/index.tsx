import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useLive, useRepositories } from '@/db/hooks';
import { buildTimeline } from '@/domain/timeline';
import { AI_KEY_MISSING_HINT, useAiFeatureLock } from '@/features/ai/ai-feature-lock';
import { placeLabel } from '@/features/applications/components/application-row';
import { Facts } from '@/features/applications/components/detail/facts';
import {
  AppointmentsSection,
  ContactsSection,
  NotesSection,
  TimelineSection,
} from '@/features/applications/components/detail/sections';
import { StatusPicker } from '@/features/applications/components/detail/status-picker';
import { NotFound } from '@/features/applications/components/not-found';
import { ReminderList } from '@/features/reminders/reminder-list';
import { SerifFont } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { ListRow } from '@/ui/list-row';
import { confirm } from '@/ui/dialogs';
import { Screen } from '@/ui/screen';
import { Section } from '@/ui/section';
import { showToast } from '@/ui/toast';

export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const repositories = useRepositories();
  const { locked, ensureUnlocked } = useAiFeatureLock();
  // Nach dem Löschen nicht kurz „nicht gefunden“ zeigen, während der Screen ausblendet
  const [deleting, setDeleting] = useState(false);

  const detail = useLive(
    ({ applications, details, reminders }) => {
      const application = applications.get(id);
      if (!application) return undefined;
      return {
        application,
        events: applications.statusEvents(id),
        contacts: details.contacts(id),
        notes: details.notes(id),
        appointments: details.appointments(id),
        reminders: reminders.forApplication(id),
      };
    },
    ['applications', 'status_events', 'contacts', 'notes', 'appointments', 'reminders'],
    [id],
  );

  if (!detail) return deleting ? null : <NotFound />;
  const { application, events, contacts, notes, appointments, reminders } = detail;

  async function remove() {
    const confirmed = await confirm({
      title: `${application.company} löschen?`,
      message:
        'Die Bewerbung verschwindet aus allen Listen. Du kannst das gleich rückgängig machen.',
      confirmLabel: 'Löschen',
    });
    if (!confirmed) return;
    setDeleting(true);
    repositories.applications.archive(id);
    router.back();
    showToast({
      message: `„${application.company}“ gelöscht`,
      action: { label: 'Rückgängig', onPress: () => repositories.applications.restore(id) },
    });
  }

  const place = placeLabel(application);

  /** Ohne eigenen Key erklärt erst der Dialog die Sperre, statt das Assistenten-Modal zu öffnen */
  async function openAssistant(aufgabe: 'passung' | 'vorbereitung' | 'entwurf') {
    if (!(await ensureUnlocked())) return;
    router.push({ pathname: '/bewerbung/[id]/ki', params: { id, aufgabe } });
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: application.company,
          headerRight: () => (
            <View style={styles.headerAction}>
              <Button
                label="Bearbeiten"
                variant="secondary"
                compact
                onPress={() =>
                  router.push({ pathname: '/bewerbung/[id]/bearbeiten', params: { id } })
                }
              />
            </View>
          ),
        }}
      />

      <View style={styles.header}>
        <Text style={[styles.company, { color: theme.text }]}>{application.company}</Text>
        <Text style={[styles.role, { color: theme.text }]}>{application.role}</Text>
        {place ? <Text style={[styles.place, { color: theme.textSecondary }]}>{place}</Text> : null}
      </View>

      <StatusPicker
        value={application.status}
        onChange={(status) => repositories.applications.changeStatus(id, status)}
      />

      {application.nextStep ? (
        <View style={[styles.nextStep, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.nextStepLabel, { color: theme.accentSoftEyebrow }]}>
            NÄCHSTER SCHRITT
          </Text>
          <Text style={[styles.nextStepText, { color: theme.accentSoftText }]}>
            {application.nextStep}
          </Text>
        </View>
      ) : null}

      <AppointmentsSection applicationId={id} appointments={appointments} />
      <Section
        title="Erinnerungen"
        action={
          <Button
            label="Erinnerung"
            icon={{ ios: 'plus', android: 'add', web: 'add' }}
            variant="secondary"
            compact
            onPress={() => router.push({ pathname: '/bewerbung/[id]/erinnerung', params: { id } })}
          />
        }>
        {reminders.length ? (
          <ReminderList reminders={reminders} />
        ) : (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Keine offenen Erinnerungen. Nachhaken und Termin-Erinnerungen entstehen automatisch.
          </Text>
        )}
      </Section>
      <Section title="KI-Assistent">
        {(
          [
            [
              'passung',
              'Passt die Stelle zu mir?',
              'Abgleich mit deinem Profil',
              { ios: 'checkmark.seal', android: 'verified', web: 'verified' },
            ],
            [
              'vorbereitung',
              'Gespräch vorbereiten',
              'Wahrscheinliche Fragen und gute Rückfragen',
              { ios: 'questionmark.bubble', android: 'quiz', web: 'quiz' },
            ],
            [
              'entwurf',
              'Text entwerfen',
              'Anschreiben, Nachfass- oder Dankes-Mail',
              { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
            ],
          ] as const
        ).map(([aufgabe, title, subtitle, icon], index) => (
          <ListRow
            key={aufgabe}
            first={index === 0}
            icon={icon}
            title={title}
            subtitle={subtitle}
            trailing={
              locked ? (
                <SymbolView
                  name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
                  tintColor={theme.textSecondary}
                  size={14}
                />
              ) : null
            }
            accessibilityHint={locked ? AI_KEY_MISSING_HINT : undefined}
            onPress={() => openAssistant(aufgabe)}
          />
        ))}
      </Section>
      <Section title="Eckdaten">
        <Facts application={application} />
      </Section>
      <ContactsSection applicationId={id} contacts={contacts} />
      <NotesSection applicationId={id} notes={notes} />
      <TimelineSection items={buildTimeline({ events, notes, appointments })} />

      <View style={styles.delete}>
        <Button
          label="Bewerbung löschen"
          variant="danger"
          icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
          onPress={remove}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    marginBottom: 16,
  },
  company: {
    fontFamily: SerifFont,
    fontSize: 32,
    lineHeight: 38,
  },
  role: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
  },
  place: {
    fontSize: 14,
  },
  nextStep: {
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    gap: 4,
  },
  nextStepLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextStepText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  delete: {
    marginTop: 32,
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    padding: 15,
  },
  headerAction: {
    // Im Browser setzt der Header keinen Randabstand
    marginRight: Platform.OS === 'web' ? 16 : 0,
  },
});
