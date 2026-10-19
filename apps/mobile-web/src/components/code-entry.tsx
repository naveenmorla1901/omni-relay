import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CodeEntryProps = {
  title: string;
  description: string;
  placeholder: string;
  actionLabel: string;
  onScan: () => void;
  onSubmit: (code: string) => void;
  busy?: boolean;
  error?: string | null;
};

export function CodeEntry({
  title,
  description,
  placeholder,
  actionLabel,
  onScan,
  onSubmit,
  busy = false,
  error,
}: CodeEntryProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  function submit() {
    if (trimmed.length > 0 && !busy) {
      onSubmit(trimmed);
    }
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.header}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.accent}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        value={value}
      />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onScan}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: theme.border,
              backgroundColor: pressed ? theme.backgroundSelected : theme.background,
            },
          ]}>
          <ThemedText type="smallBold">Scan QR</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!trimmed || busy}
          onPress={submit}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.accent,
              opacity: !trimmed || busy ? 0.45 : pressed ? 0.8 : 1,
            },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            {busy ? 'Working…' : actionLabel}
          </ThemedText>
        </Pressable>
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 17,
    minHeight: 78,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
