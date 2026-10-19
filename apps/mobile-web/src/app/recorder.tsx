import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createCameraSource } from '@/camera';
import type { ICameraSource } from '@/camera';
import { AccessBoundary } from '@/components/access-boundary';
import { CodeEntry } from '@/components/code-entry';
import { PairingCard } from '@/components/pairing-card';
import { QrScanner } from '@/components/qr-scanner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoView } from '@/components/video-view';
import { CONFIG } from '@/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { useSessionStore } from '@/store/session';

export default function RecorderScreen() {
  return (
    <AccessBoundary>
      <RecorderWorkspace />
    </AccessBoundary>
  );
}

function RecorderWorkspace() {
  const theme = useTheme();
  const lock = useSessionStore((state) => state.lock);
  const pairing = usePairing('recorder');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const cameraRef = useRef<ICameraSource | null>(null);
  const autoStartedRef = useRef(false);

  const startCamera = useCallback(async () => {
    if (cameraBusy) {
      return;
    }

    setCameraBusy(true);
    setCameraError(null);

    try {
      if (!cameraRef.current) {
        cameraRef.current = createCameraSource();
      }

      const camera = cameraRef.current;
      const permitted = await camera.requestPermission();
      if (!permitted) {
        throw new Error('This browser does not expose a camera. Open the page over HTTPS and allow camera access.');
      }

      await camera.start('', {
        width: CONFIG.CAPTURE_RESOLUTION.width,
        height: CONFIG.CAPTURE_RESOLUTION.height,
        fps: CONFIG.TARGET_FPS,
      });

      const stream = camera.getStream();
      if (!stream) {
        throw new Error('The camera did not return a video stream.');
      }

      setLocalStream(stream);
      const track = stream.getVideoTracks()[0];
      if (track) {
        pairing.attachVideoTrack(track);
      }

      await camera.lockExposureFocusWhiteBalance();
    } catch (error) {
      setCameraError(cameraErrorMessage(error));
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy, pairing]);

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    setLocalStream(null);
  }, []);

  useEffect(() => {
    return () => {
      cameraRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (pairing.phase === 'connected' && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startCamera();
    }
  }, [pairing.phase, startCamera]);

  useEffect(() => {
    if (pairing.phase === 'failed') {
      autoStartedRef.current = false;
      cameraRef.current?.stop();
      const timer = setTimeout(() => setLocalStream(null), 0);
      return () => clearTimeout(timer);
    }
  }, [pairing.phase]);

  function endSession() {
    stopCamera();
    autoStartedRef.current = false;
    setCameraError(null);
    setScannerOpen(false);
    pairing.reset();
  }

  const connected = pairing.phase === 'connected';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.topbar}>
            <Link href="/" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  ← All roles
                </ThemedText>
              </Pressable>
            </Link>

            <View style={styles.topbarRight}>
              <StatusChip
                label={connected ? 'Admin connected' : pairing.phase === 'failed' ? 'Pairing failed' : 'Not paired'}
                active={connected}
                danger={pairing.phase === 'failed'}
              />
              <Pressable
                accessibilityRole="button"
                onPress={lock}
                style={({ pressed }) => [
                  styles.lockButton,
                  {
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Lock
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>
              Recorder
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.summary}>
              Pair this phone with Admin, then point the camera at the screen or page you want to
              send. Camera starts only after pairing.
            </ThemedText>
          </View>

          {connected ? (
            <View style={styles.liveLayout}>
              <View style={[styles.videoFrame, { borderColor: theme.border }]}>
                <VideoView stream={localStream} placeholder="Starting camera…" />
              </View>

              <View style={styles.liveControls}>
                <View style={styles.statusRow}>
                  <StatusChip label="Encrypted WebRTC link" active />
                  <StatusChip
                    label={localStream ? 'Camera live' : 'Camera off'}
                    active={Boolean(localStream)}
                    danger={Boolean(cameraError)}
                  />
                  {pairing.peerRole ? <StatusChip label={`Peer: ${pairing.peerRole}`} active /> : null}
                </View>

                {cameraError ? (
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {cameraError}
                    </ThemedText>
                  </View>
                ) : null}

                <ThemedText type="small" themeColor="textSecondary">
                  Keep the phone steady. The stream is intentionally low-FPS and high-resolution so
                  text stays legible.
                </ThemedText>

                <View style={styles.actions}>
                  {localStream ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={stopCamera}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        {
                          borderColor: theme.border,
                          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                        },
                      ]}>
                      <ThemedText type="smallBold">Stop camera</ThemedText>
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={cameraBusy}
                      onPress={() => void startCamera()}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        {
                          backgroundColor: theme.accent,
                          opacity: cameraBusy ? 0.45 : pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                        {cameraBusy ? 'Starting…' : 'Start camera'}
                      </ThemedText>
                    </Pressable>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    onPress={endSession}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      {
                        borderColor: theme.border,
                        backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                      },
                    ]}>
                    <ThemedText type="smallBold">End session</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.panelHeader}>
                <ThemedText type="smallBold">Connect to Admin</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  One Recorder pairs with one Admin. No account or cloud session is involved.
                </ThemedText>
              </View>

              {pairing.phase === 'idle' ? (
                <>
                  <StepLine number="1" text="Create an invite on this phone." />
                  <StepLine number="2" text="Admin scans it and shows an answer QR." />
                  <StepLine number="3" text="Scan the answer. The camera starts automatically." />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pairing.createInvite()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                      Create invite
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}

              {pairing.phase === 'creating-invite' ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Gathering connection details…
                  </ThemedText>
                </View>
              ) : null}

              {pairing.phase === 'waiting-for-answer' && pairing.localCode ? (
                <>
                  <PairingCard
                    title="Your invite code"
                    description="Show this to Admin, or copy the text code and send it to the Admin device."
                    code={pairing.localCode}
                  />

                  {scannerOpen ? (
                    <QrScanner
                      onClose={() => setScannerOpen(false)}
                      onScan={(code) => {
                        setScannerOpen(false);
                        void pairing.acceptAnswer(code);
                      }}
                    />
                  ) : (
                    <CodeEntry
                      title="Admin answer"
                      description="Scan the answer QR shown by Admin, or paste its text code here."
                      placeholder="Paste the Admin answer code…"
                      actionLabel="Connect"
                      onScan={() => setScannerOpen(true)}
                      onSubmit={(code) => void pairing.acceptAnswer(code)}
                      busy={pairing.busy}
                      error={pairing.error}
                    />
                  )}
                </>
              ) : null}

              {pairing.phase === 'waiting-for-connection' ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Connecting to Admin…
                  </ThemedText>
                </View>
              ) : null}

              {pairing.phase === 'failed' ? (
                <>
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {pairing.error ?? 'Pairing failed. Try again.'}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pairing.createInvite()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                      Start a new invite
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatusChip({
  label,
  active,
  danger = false,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : active ? theme.success : theme.textSecondary;

  return (
    <View style={[styles.statusChip, { borderColor: theme.border }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function StepLine({ number, text }: { number: string; text: string }) {
  const theme = useTheme();

  return (
    <View style={styles.stepLine}>
      <View style={[styles.stepNumber, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="code">{number}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
        {text}
      </ThemedText>
    </View>
  );
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow camera access for this site, then try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not start the camera.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  topbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lockButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  heading: {
    gap: Spacing.two,
    maxWidth: 760,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
  },
  summary: {
    fontSize: 17,
    lineHeight: 26,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  panelHeader: {
    gap: Spacing.one,
  },
  stepLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    paddingTop: 2,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.three,
  },
  liveLayout: {
    gap: Spacing.three,
  },
  videoFrame: {
    height: 380,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  liveControls: {
    gap: Spacing.three,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
