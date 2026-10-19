import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type QrScannerProps = {
  onScan: (value: string) => void;
  onClose: () => void;
};

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let animationFrame = 0;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
        setError('This browser cannot access a camera. Use HTTPS and allow camera access.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const tick = () => {
          if (cancelled) {
            return;
          }

          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(frame.data, frame.width, frame.height, {
              inversionAttempts: 'dontInvert',
            });

            if (result?.data) {
              cancelled = true;
              onScanRef.current(result.data);
              return;
            }
          }

          animationFrame = requestAnimationFrame(tick);
        };

        animationFrame = requestAnimationFrame(tick);
      } catch (scanError) {
        if (!cancelled) {
          setError(cameraErrorMessage(scanError));
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  return (
    <View style={[styles.frame, { borderColor: theme.border }]}>
      <View style={styles.videoWrap}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#05070A' }}
        />
        {error ? (
          <View style={styles.errorOverlay}>
            <ThemedText type="small" style={{ color: '#FFFFFF', textAlign: 'center' }}>
              {error}
            </ThemedText>
          </View>
        ) : (
          <View pointerEvents="none" style={styles.scanHint}>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
              Point at the other device&apos;s QR code
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footerCopy}>
          Camera scanning stays on this device.
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
          <ThemedText type="smallBold">Cancel scan</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow camera access, then scan again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not start the camera.';
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    gap: Spacing.two,
    backgroundColor: '#05070A',
  },
  videoWrap: {
    height: 320,
    position: 'relative',
    backgroundColor: '#05070A',
  },
  scanHint: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: 'rgba(5, 7, 10, 0.72)',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(5, 7, 10, 0.86)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    flexWrap: 'wrap',
  },
  footerCopy: {
    flexShrink: 1,
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
