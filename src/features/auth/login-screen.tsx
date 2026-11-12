import type { AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { SerifFont } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { Button } from '@/ui/button';
import { FormField } from '@/ui/form-field';
import { Screen } from '@/ui/screen';
import { showToast } from '@/ui/toast';

const CREDENTIALS_MESSAGE = 'E-Mail oder Passwort falsch';
const UNREACHABLE_MESSAGE = 'Anmeldung gerade nicht möglich. Bitte prüfe deine Verbindung.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginFormValues = { email: string; password: string };
type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;

/** Leere Felder und offensichtlich falsche Adressen abfangen, bevor Supabase gefragt wird */
export function validateLogin({ email, password }: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};
  if (!email.trim()) errors.email = 'Bitte E-Mail-Adresse eingeben';
  else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Bitte eine gültige E-Mail-Adresse eingeben';
  }
  if (!password) errors.password = 'Bitte Passwort eingeben';
  return errors;
}

/**
 * Falsche Zugangsdaten gehören ins Formular; alles andere (kein Netz, Serverfehler) in einen
 * Hinweis, weil dort kein Feld zu korrigieren ist.
 */
export function isCredentialsError(error: AuthError) {
  return error.code === 'invalid_credentials' || error.code === 'invalid_grant';
}

/**
 * Anmeldemaske statt der App: ohne Session rendert das Root-Layout nur diese Ansicht. Konten legt
 * man im Supabase-Dashboard an, in der App gibt es keine Registrierung und keinen Passwort-Reset.
 */
export function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [values, setValues] = useState<LoginFormValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [failed, setFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set(field: keyof LoginFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Der Fehler des Feldes verschwindet, sobald es geändert wird
    if (errors[field]) setErrors(({ [field]: _, ...rest }) => rest);
    setFailed(false);
  }

  async function submit() {
    if (isSubmitting) return;
    const found = validateLogin(values);
    setErrors(found);
    setFailed(false);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const error = await signIn(values.email.trim(), values.password);
      // Ohne Fehler übernimmt die Session aus dem Auth-Listener, diese Ansicht verschwindet
      if (!error) return;
      if (isCredentialsError(error)) setFailed(true);
      else showToast({ message: UNREACHABLE_MESSAGE });
    } catch {
      showToast({ message: UNREACHABLE_MESSAGE });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scroll={false} safeTop>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            jobpilot<Text style={{ color: theme.accentText }}>.</Text>
          </Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>Bitte melde dich an.</Text>
        </View>
        <FormField
          label="E-Mail"
          value={values.email}
          onChangeText={(text) => set('email', text)}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          error={errors.email}
        />
        <FormField
          label="Passwort"
          value={values.password}
          onChangeText={(text) => set('password', text)}
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={submit}
          error={errors.password}
        />
        {failed ? (
          <Text accessibilityRole="alert" style={[styles.failed, { color: theme.danger }]}>
            {CREDENTIALS_MESSAGE}
          </Text>
        ) : null}
        <Button
          label={isSubmitting ? 'Anmelden …' : 'Anmelden'}
          disabled={isSubmitting}
          onPress={submit}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: 32,
  },
  header: {
    gap: 10,
    marginBottom: 26,
  },
  title: {
    fontFamily: SerifFont,
    fontSize: 40,
    lineHeight: 46,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
  },
  failed: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
    marginBottom: 14,
  },
});
