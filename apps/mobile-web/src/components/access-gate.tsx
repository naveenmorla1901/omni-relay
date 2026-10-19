import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSessionStore } from '@/store/session';

export function AccessGate() {
  const theme = useTheme();
  const unlockWithKey = useSessionStore((state) => state.unlockWithKey);
  const [key, setKey] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = key.trim().length > 0;

  function submit() {
    if (!canSubmit) {
      return;
    }

    if (!unlockWithKey(key)) {
      setError('That key does not match. Check it with the person who shared the app.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.eyebrow, { borderColor: theme.border }]}>
                <ThemedText type="code" themeColor="textSecondary">
                  PRIVATE ACCESS
                </ThemedText>
              </View>

              <ThemedText style={styles.wordmark}>ClearRelay</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.intro}>
                Enter the access key to open this device as a Recorder, Admin, or Projector.
              </ThemedText>

              <View style={styles.field}>
                <ThemedText type="smallBold">Access key</ThemedText>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  onBlur={() => setFocused(false)}
                  onChangeText={(value) => {
                    setKey(value);
                    setError(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onSubmitEditing={submit}
                  placeholder="Enter your key"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: error ? theme.danger : focused ? theme.accent : theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={key}
                />
                {error ? (
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {error}
                  </ThemedText>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={submit}
                style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: theme.accent,
                    opacity: !canSubmit ? 0.45 : pressed ? 0.8 : 1,
                  },
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  Unlock ClearRelay
                </ThemedText>
              </Pressable>

              <View style={[styles.footer, { borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  The key is checked on this device and is not sent anywhere. Closing the app locks
                  the session again.
                </ThemedText>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 520),
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.five,
    gap: Spacing.four,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  wordmark: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  intro: {
    fontSize: 17,
    lineHeight: 26,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
});
