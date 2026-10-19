import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { CodeEntry } from '@/components/code-entry';
import { PairingCard } from '@/components/pairing-card';
import { QrScanner } from '@/components/qr-scanner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoView } from '@/components/video-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { useSessionStore } from '@/store/session';

type SendMode = 'image' | 'code';

export default function AdminScreen() {
  return (
    <AccessBoundary>
      <AdminWorkspace />
    </AccessBoundary>
  );
}

function AdminWorkspace() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const lock = useSessionStore((state) => state.lock);
  const pairing = usePairing('admin');
  const [mode, setMode] = useState<SendMode>('code');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const wide = width >= 1000;
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
              <StatusChip label={connected ? 'Recorder connected' : 'Recorder offline'} active={connected} />
              <StatusChip label="Projector offline" />
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
              Admin
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.summary}>
              Watch the Recorder feed on the left, then compose an image or code payload for the
              Projector on the right.
            </ThemedText>
          </View>

          <View style={[styles.workspace, wide && styles.workspaceWide]}>
            <View
              style={[
                styles.pane,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.paneHeader}>
                <ThemedText type="smallBold">Live feed</ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  {connected ? 'LINK A · LIVE' : 'LINK A · PAIR'}
                </ThemedText>
              </View>

              {connected ? (
                <>
                  <View style={[styles.liveVideo, { borderColor: theme.border }]}>
                    <VideoView
                      stream={pairing.remoteStream}
                      placeholder="Waiting for the Recorder camera…"
                    />
                  </View>

                  <View style={styles.statusRow}>
                    <StatusChip label="WebRTC link live" active />
                    <StatusChip
                      label={pairing.peerRole === 'recorder' ? 'Recorder checked in' : 'Waiting for hello'}
                      active={pairing.peerRole === 'recorder'}
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <DisabledAction label="Capture still" note="M3" />
                    <DisabledAction label="Open gallery" note="M3" />
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => pairing.reset()}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      {
                        borderColor: theme.border,
                        backgroundColor: pressed ? theme.backgroundSelected : theme.background,
                      },
                    ]}>
                    <ThemedText type="smallBold">End connection</ThemedText>
                  </Pressable>
                </>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Pair the Recorder phone to see its camera here. The Recorder creates the invite;
                    this Admin device scans it and shows the answer.
                  </ThemedText>

                  {scannerOpen ? (
                    <QrScanner
                      onClose={() => setScannerOpen(false)}
                      onScan={(inviteCode) => {
                        setScannerOpen(false);
                        void pairing.joinInvite(inviteCode);
                      }}
                    />
                  ) : null}

                  {pairing.phase === 'idle' || pairing.phase === 'failed' ? (
                    <>
                      {pairing.phase === 'failed' ? (
                        <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                          <ThemedText type="small" style={{ color: theme.danger }}>
                            {pairing.error ?? 'Could not pair with the Recorder. Try again.'}
                          </ThemedText>
                        </View>
                      ) : null}

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setScannerOpen(true)}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                        ]}>
                        <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                          Scan Recorder invite
                        </ThemedText>
                      </Pressable>

                      {!scannerOpen ? (
                        <CodeEntry
                          title="Recorder invite"
                          description="No camera on this device? Paste the Recorder's invite code instead."
                          placeholder="Paste the Recorder invite code…"
                          actionLabel="Create answer"
                          onScan={() => setScannerOpen(true)}
                          onSubmit={(inviteCode) => {
                            setScannerOpen(false);
                            void pairing.joinInvite(inviteCode);
                          }}
                          busy={pairing.busy}
                          error={pairing.error}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {pairing.phase === 'joining' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={theme.accent} />
                      <ThemedText type="small" themeColor="textSecondary">
                        Creating the Admin answer…
                      </ThemedText>
                    </View>
                  ) : null}

                  {pairing.phase === 'waiting-for-connection' && pairing.localCode ? (
                    <>
                      <PairingCard
                        title="Admin answer"
                        description="Show this to the Recorder phone. It will scan this answer and start the camera."
                        code={pairing.localCode}
                      />
                      <View style={styles.loadingRow}>
                        <ActivityIndicator color={theme.accent} />
                        <ThemedText type="small" themeColor="textSecondary">
                          Waiting for the Recorder to connect…
                        </ThemedText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => pairing.reset()}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          {
                            borderColor: theme.border,
                            backgroundColor: pressed ? theme.backgroundSelected : theme.background,
                          },
                        ]}>
                        <ThemedText type="smallBold">Cancel</ThemedText>
                      </Pressable>
                    </>
                  ) : null}
                </>
              )}
            </View>

            <View
              style={[
                styles.pane,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.paneHeader}>
                <ThemedText type="smallBold">Send to Projector</ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  LINK B · M4
                </ThemedText>
              </View>

              <View style={styles.tabs}>
                {(['image', 'code'] as const).map((tab) => {
                  const active = mode === tab;
                  return (
                    <Pressable
                      key={tab}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setMode(tab)}
                      style={[
                        styles.tab,
                        {
                          backgroundColor: active ? theme.backgroundSelected : 'transparent',
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}>
                      <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>
                        {tab === 'image' ? 'Image' : 'Code'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {mode === 'code' ? (
                <View style={styles.form}>
                  <TextInput
                    multiline
                    onChangeText={setCode}
                    placeholder="Paste or type code to show on the Projector…"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    style={[
                      styles.codeInput,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    textAlignVertical="top"
                    value={code}
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setLanguage}
                    placeholder="Language (optional)"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    style={[
                      styles.languageInput,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    value={language}
                  />
                </View>
              ) : (
                <View
                  style={[
                    styles.imageDrop,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Image payload
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Capture a still from the live feed in M3, then chunk and send it in M4.
                  </ThemedText>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                disabled
                style={[styles.sendButton, { backgroundColor: theme.accent, opacity: 0.4 }]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  Send to Projector
                </ThemedText>
              </Pressable>

              <ThemedText type="small" themeColor="textSecondary">
                Draft only. Link B, image chunking, and the Projector render path arrive in M4.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatusChip({ label, active = false }: { label: string; active?: boolean }) {
  const theme = useTheme();

  return (
    <View style={[styles.statusChip, { borderColor: theme.border }]}>
      <View
        style={[styles.statusDot, { backgroundColor: active ? theme.success : theme.textSecondary }]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function DisabledAction({ label, note }: { label: string; note: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.disabledAction,
        { borderColor: theme.border, backgroundColor: theme.background },
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary">
        {note}
      </ThemedText>
    </View>
  );
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
  workspace: {
    gap: Spacing.three,
  },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  pane: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  video: {
    minHeight: 320,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#05070A',
    padding: Spacing.four,
  },
  liveVideo: {
    height: 340,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#05070A',
  },
  videoLabel: {
    color: '#8B96A5',
    fontSize: 16,
  },
  videoHint: {
    color: '#8B96A5',
    textAlign: 'center',
  },
  videoMeta: {
    color: '#5F6B7A',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  disabledAction: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    opacity: 0.7,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  form: {
    gap: Spacing.two,
  },
  codeInput: {
    minHeight: 190,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 20,
    padding: Spacing.three,
  },
  languageInput: {
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  imageDrop: {
    minHeight: 260,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
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
});
