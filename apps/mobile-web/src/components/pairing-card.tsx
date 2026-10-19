import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { copyToClipboard } from '@/lib/clipboard';

type PairingCardProps = {
  title: string;
  description: string;
  code: string;
};

export function PairingCard({ title, description, code }: PairingCardProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copy() {
    const success = await copyToClipboard(code);
    setCopied(success);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
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

      <View style={styles.qrRow}>
        <QrCode value={code} />
      </View>

      <TextInput
        accessibilityLabel="Pairing code"
        editable={false}
        multiline
        selectTextOnFocus
        style={[
          styles.code,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.textSecondary,
          },
        ]}
        value={code}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => void copy()}
        style={({ pressed }) => [
          styles.copyButton,
          {
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundSelected : theme.background,
          },
        ]}>
        <ThemedText type="smallBold">{copied ? 'Copied' : 'Copy code'}</ThemedText>
      </Pressable>
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
  qrRow: {
    alignItems: 'center',
  },
  code: {
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 15,
    maxHeight: 78,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  copyButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
