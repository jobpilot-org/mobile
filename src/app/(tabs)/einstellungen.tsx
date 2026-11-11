import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLive, useRepositories } from '@/db/hooks';
import { createDemoBackup } from '@/features/applications/demo-data';
import { AccountSettings } from '@/features/auth/account-settings';
import { AiSettings } from '@/features/ai/ai-settings';
import { isDemo } from '@/features/demo/mode';
import { ReminderSettings } from '@/features/reminders/reminder-settings';
import {
  exportBackupFile,
  exportCsvFile,
  importBackupFile,
} from '@/features/data-transfer/data-transfer';
import { SerifFont } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { notify } from '@/ui/dialogs';
import { Section } from '@/ui/section';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repositories = useRepositories();
  const hasData = useLive(
    ({ applications }) => applications.listActive().length > 0,
    ['applications'],
  );

  // Fehler beim Teilen oder Lesen von Dateien verständlich melden statt still zu scheitern
  function run(action: () => Promise<void>) {
    action().catch((error: unknown) => {
      notify('Das hat nicht geklappt', error instanceof Error ? error.message : String(error));
    });
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.eyebrow, { color: theme.accentText }]}>APP</Text>
        <Text style={[styles.title, { color: theme.text }]}>Einstellungen</Text>

        {/* Die Demo läuft ohne Anmeldung, dort gibt es kein Konto */}
        {isDemo ? null : (
          <Section title="Konto">
            <AccountSettings />
          </Section>
        )}

        <Section title="Erinnerungen">
          <ReminderSettings />
        </Section>

        <Section title="KI-Assistent">
          <AiSettings />
        </Section>

        <Section title="Daten sichern">
          <ActionRow
            icon={{ ios: 'square.and.arrow.up', android: 'ios_share', web: 'download' }}
            label="Backup exportieren"
            caption="Bewerbungen mit Verlauf, Kontakten, Notizen und Terminen als JSON"
            disabled={!hasData}
            onPress={() => run(() => exportBackupFile(repositories))}
          />
          <ActionRow
            icon={{ ios: 'tablecells', android: 'table_chart', web: 'table_chart' }}
            label="Als Tabelle exportieren"
            caption="CSV-Datei für Excel oder Numbers"
            disabled={!hasData}
            onPress={() => run(() => exportCsvFile(repositories))}
          />
        </Section>

        <Section title="Über">
          <ActionRow
            icon={{ ios: 'info.circle', android: 'info', web: 'info' }}
            label="Über jobpilot"
            caption="Was die App kann und wie sie gebaut ist"
            onPress={() => router.push('/ueber')}
          />
        </Section>

        <Section title="Daten wiederherstellen">
          <ActionRow
            icon={{ ios: 'square.and.arrow.down', android: 'upload_file', web: 'upload_file' }}
            label="Backup importieren"
            caption="Eine zuvor exportierte JSON-Datei einlesen"
            onPress={() => run(() => importBackupFile(repositories))}
          />
          <ActionRow
            icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            label="Beispieldaten laden"
            caption="Sieben Beispiel-Bewerbungen mit Terminen und Kontakten"
            onPress={() => repositories.backup.import(createDemoBackup())}
          />
        </Section>

        <Text style={[styles.footnote, { color: theme.textSecondary }]}>
          Deine Daten liegen nur auf diesem Gerät. Exportiere regelmäßig ein Backup, wenn du sie
          sichern oder auf ein anderes Gerät übertragen möchtest.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionRow({
  icon,
  label,
  caption,
  disabled,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  caption: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={caption}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.accentSoft }]}>
        <SymbolView name={icon} tintColor={theme.accentText} size={17} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.rowCaption, { color: theme.textSecondary }]}>{caption}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 42,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    fontFamily: SerifFont,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '400',
    marginTop: 5,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dimmed: {
    opacity: 0.5,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowCaption: {
    fontSize: 12,
    lineHeight: 17,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    paddingHorizontal: 4,
  },
});
