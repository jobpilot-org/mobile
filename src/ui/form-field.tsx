import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/use-theme';

type FormFieldProps = Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'keyboardType'
  | 'inputMode'
  | 'multiline'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'secureTextEntry'
  | 'autoFocus'
  | 'editable'
> & {
  label: string;
  /** Fehlermeldung unter dem Feld; färbt den Rahmen */
  error?: string;
  hint?: string;
};

export function FormField({
  label,
  error,
  hint,
  multiline,
  autoCapitalize = 'sentences',
  ...inputProps
}: FormFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-invalid={!!error}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...inputProps}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: error ? theme.danger : theme.backgroundSelected,
          },
        ]}
      />
      {error ? (
        <Text style={[styles.message, { color: theme.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
    marginBottom: 15,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
  },
});
