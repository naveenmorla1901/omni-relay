import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type QrCodeProps = {
  value: string;
  size?: number;
};

/** QR rendering for native builds lands with the native pairing implementation. */
export function QrCode({ value }: QrCodeProps) {
  return (
    <View style={styles.frame}>
      <ThemedText type="small" themeColor="textSecondary">
        QR display is available in the web build. Copy the pairing code instead.
      </ThemedText>
      <ThemedText type="code" selectable numberOfLines={2} style={styles.code}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  code: {
    color: '#111318',
  },
});
