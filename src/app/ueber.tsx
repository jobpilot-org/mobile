import { Linking, StyleSheet, Text, View } from 'react-native';

import { SerifFont } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Section } from '@/ui/section';

export const REPOSITORY_URL = 'https://github.com/Mythos-Brookdesign/jobpilot';

const FEATURES = [
  ['Pipeline', 'Von „Gemerkt“ bis „Angebot“, jeder Statuswechsel im Verlauf'],
  [
    'Termine & Erinnerungen',
    'Nachhaken, Termin am Vortag, Dankeschön danach – als Benachrichtigung',
  ],
  [
    'KI-Assistent',
    'Anzeige einfügen und Felder vorausfüllen lassen, Passung, Vorbereitung, Anschreiben',
  ],
  ['Auswertung', 'Funnel, Antwortquote, Rückmeldezeit, Erfolg je Quelle'],
  ['Offline & privat', 'Alle Daten lokal in SQLite – auf dem Handy und im Browser'],
] as const;

const DECISIONS = [
  [
    'Eine Codebasis für iOS, Android und Web',
    'Expo SDK 57 mit Expo Router: native Tabs und Datums-Picker auf dem Handy, responsive Web-Version mit Board-Ansicht.',
  ],
  [
    'Lokal statt Konto',
    'SQLite mit Drizzle ORM und versionierten Migrationen; dieselben Repositories laufen in der App und in den Tests gegen echtes SQLite.',
  ],
  [
    'Erinnerungen ohne Server',
    'Regeln als reine Funktionen, idempotenter Abgleich mit lokalen Benachrichtigungen – verschobene Termine räumen ihre Erinnerungen selbst auf.',
  ],
  [
    'KI mit klaren Grenzen',
    'Das KI-Modell läuft hinter eigenen API-Routen, der Schlüssel bleibt auf dem Server; Structured Outputs mit gemeinsamen zod-Schemas, Nutzertexte als Daten gekennzeichnet.',
  ],
  [
    'Qualität',
    'TypeScript strict, über 120 Tests, CI mit GitHub Actions; zwei Fehler in expo-sqlite gefunden und per Patch behoben.',
  ],
] as const;

export default function AboutScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: theme.text }]}>
        jobpilot<Text style={{ color: theme.accentText }}>.</Text>
      </Text>
      <Text style={[styles.lead, { color: theme.text }]}>
        Bewerbungen im Blick behalten – eine App für die eigene Jobsuche, von der ersten Anzeige bis
        zum Angebot.
      </Text>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Entstanden als Portfolio-Projekt: Ich wollte zeigen, wie ich eine App von der Idee bis zur
        Auslieferung baue – mit durchdachter Architektur, Tests und einem KI-Feature, das echten
        Nutzen hat.
      </Text>

      <Section title="Was die App kann">
        {FEATURES.map(([title, text], index) => (
          <View
            key={title}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.rowText, { color: theme.textSecondary }]}>{text}</Text>
          </View>
        ))}
      </Section>

      <Section title="Wie sie gebaut ist" plain>
        {DECISIONS.map(([title, text]) => (
          <View key={title} style={styles.decision}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>{text}</Text>
          </View>
        ))}
      </Section>

      <View style={styles.actions}>
        <Button
          label="Code auf GitHub"
          icon={{ ios: 'chevron.left.forwardslash.chevron.right', android: 'code', web: 'code' }}
          onPress={() => Linking.openURL(REPOSITORY_URL)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: SerifFont,
    fontSize: 40,
    lineHeight: 46,
  },
  lead: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
    marginTop: 8,
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  row: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  rowText: {
    fontSize: 13,
    lineHeight: 19,
  },
  decision: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  actions: {
    marginTop: 18,
    alignItems: 'flex-start',
  },
});
