import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type QrCodeProps = {
  value: string;
  size?: number;
};

type QrState = {
  value: string;
  uri: string | null;
  error: string | null;
};

export function QrCode({ value, size = 288 }: QrCodeProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const resolvedSize = Math.max(160, Math.min(size, width - 120));
  const [state, setState] = useState<QrState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(value, {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 480,
      color: { dark: '#0B0D10', light: '#FFFFFF' },
    })
      .then((nextUri) => {
        if (!cancelled) {
          setState({ value, uri: nextUri, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            value,
            uri: null,
            error: 'Could not render the QR code. Copy the text code instead.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  const current = state?.value === value ? state : null;
  const uri = current?.uri ?? null;
  const error = current?.error ?? null;

  if (error) {
    return (
      <ThemedText type="small" style={{ color: theme.warning }}>
        {error}
      </ThemedText>
    );
  }

  return (
    <View style={[styles.frame, { width: resolvedSize + 24, height: resolvedSize + 24 }]}>
      {uri ? (
        <Image
          accessibilityLabel="Pairing QR code"
          source={{ uri }}
          style={{ width: resolvedSize, height: resolvedSize }}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Building QR…
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
});
