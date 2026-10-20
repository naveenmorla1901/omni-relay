import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { useSessionStore } from '@/store/session';

export default function ProjectorScreen() {
  return (
    <AccessBoundary>
      <ProjectorWorkspace />
    </AccessBoundary>
  );
}

function ProjectorWorkspace() {
  const theme = useTheme();
  const lock = useSessionStore((s) => s.lock);
  const pairing = usePairing('display');
  const [codeInput, setCodeInput] = useState('');
  const connected = pairing.phase === 'connected';
  const received = pairing.receivedImage;
  const imageSrc = received ? `data:${received.mime};base64,${received.data}` : null;

  const handleJoin = () => {
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    void pairing.joinRoom(trimmed);
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Top bar */}
          <View style={styles.topbar}>
            <Link href="/" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>← All roles</ThemedText>
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              onPress={lock}
              style={({ pressed }) => [
                styles.lockBtn,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.border },
              ]}>
              <ThemedText type="small" themeColor="textSecondary">Lock</ThemedText>
            </Pressable>
          </View>

          {/* Heading */}
          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>Projector</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Enter the session code from Admin to connect. Images and code will appear full-screen.
            </ThemedText>
          </View>

          {/* Connection panel */}
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>

            {(pairing.phase === 'idle' || pairing.phase === 'failed') && (
              <>
                {pairing.phase === 'failed' && pairing.error && (
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>{pairing.error}</ThemedText>
                  </View>
                )}

                <ThemedText type="smallBold">Session code</ThemedText>
                <View style={styles.codeEntry}>
                  <TextInput
                    value={codeInput}
                    onChangeText={(v) => setCodeInput(v.toUpperCase())}
                    placeholder="e.g. AB3K7Z"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                    style={[styles.codeInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    onSubmitEditing={handleJoin}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!codeInput.trim()}
                    onPress={handleJoin}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: theme.accent, opacity: !codeInput.trim() ? 0.4 : pressed ? 0.8 : 1 },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: theme.accentText }}>Connect</ThemedText>
                  </Pressable>
                </View>

                <ThemedText type="small" themeColor="textSecondary">
                  Open Admin on your other device and tap &ldquo;Create session&rdquo; to get the code.
                </ThemedText>
              </>
            )}

            {(pairing.phase === 'joining' || pairing.phase === 'exchanging' || pairing.phase === 'connecting') && (
              <View style={styles.statusRow}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary">Connecting…</ThemedText>
              </View>
            )}

            {connected && (
              <>
                <View style={[styles.connectedBadge, { backgroundColor: theme.success + '22', borderColor: theme.success }]}>
                  <View style={[styles.dot, { backgroundColor: theme.success }]} />
                  <ThemedText type="smallBold" style={{ color: theme.success }}>Connected to Admin</ThemedText>
                </View>

                <View style={[styles.display, { backgroundColor: '#05070A', borderColor: theme.border }]}>
                  {imageSrc ? (
                    <Image
                      source={{ uri: imageSrc }}
                      style={styles.displayImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <>
                      <ThemedText style={styles.displayPlaceholder} themeColor="textSecondary">
                        Waiting for content from Admin…
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Admin will push an image once Recorder is live.
                      </ThemedText>
                    </>
                  )}
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => { pairing.reset(); setCodeInput(''); }}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                  ]}>
                  <ThemedText type="smallBold">Disconnect</ThemedText>
                </Pressable>
              </>
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lockBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  heading: { gap: Spacing.two, maxWidth: 760 },
  title: { fontSize: 44, lineHeight: 50 },
  subtitle: { fontSize: 17, lineHeight: 26 },
  panel: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.three },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: Spacing.three },
  codeEntry: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 22,
    fontFamily: 'monospace',
    letterSpacing: 4,
    textAlign: 'center',
  },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  secondaryBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 12, padding: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4 },
  display: {
    minHeight: 300,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  displayPlaceholder: { fontSize: 18, textAlign: 'center' },
  displayImage: { width: '100%', height: '100%', borderRadius: 14 },
});
