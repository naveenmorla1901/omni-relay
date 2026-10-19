import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type QrScannerProps = {
  onScan: (value: string) => void;
  onClose: () => void;
};

/** Native QR scanning lands with the native pairing implementation. */
export function QrScanner({ onClose }: QrScannerProps) {
  const theme = useTheme();

  return (
    <View style={[styles.frame, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        Camera scanning is available in the web build. Paste the pairing code instead.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [
          styles.closeButton,
          {
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          },
        ]}>
        <ThemedText type="smallBold">Close</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  closeButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
