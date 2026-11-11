import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { confirm, notify } from '@/ui/dialogs';

const SIGNOUT_FAILED_TITLE = 'Abmelden hat nicht geklappt';
const SIGNOUT_FAILED_MESSAGE = 'Bitte prüfe deine Verbindung und versuche es noch einmal.';

/**
 * Konto-Bereich der Einstellungen: zeigt die angemeldete E-Mail und meldet nach Rückfrage ab.
 * Ohne Session gibt es nichts anzuzeigen (die Demo läuft ohne Anmeldung); nach dem Abmelden
 * verschwindet die Session über den Auth-Listener und das Root-Layout zeigt die Anmeldemaske.
 */
export function AccountSettings() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const email = session?.user.email;

  if (!email) return null;

  async function signOutAfterConfirm() {
    if (isSigningOut) return;
    const confirmed = await confirm({
      title: 'Abmelden?',
      message: 'Du landest wieder auf der Anmeldung. Deine Daten bleiben auf diesem Gerät.',
      confirmLabel: 'Abmelden',
    });
    if (!confirmed) return;

    setIsSigningOut(true);
    try {
      const error = await signOut();
      if (error) notify(SIGNOUT_FAILED_TITLE, SIGNOUT_FAILED_MESSAGE);
    } catch {
      notify(SIGNOUT_FAILED_TITLE, SIGNOUT_FAILED_MESSAGE);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.email, { color: theme.text }]}>{email}</Text>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>Angemeldet</Text>
        </View>
        <Button
          label={isSigningOut ? 'Abmelden …' : 'Abmelden'}
          variant="danger"
          compact
          disabled={isSigningOut}
          onPress={signOutAfterConfirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 15,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  email: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
  },
});
