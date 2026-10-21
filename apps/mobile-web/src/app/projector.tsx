import { Link } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { ProjectorDropZone } from '@/components/projector-drop-zone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import type { Viewport } from '@/lib/stage';
import { useSessionStore } from '@/store/session';

type LocalContent =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'code'; text: string };

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
  const [localContent, setLocalContent] = useState<LocalContent | null>(null);
  const connected = pairing.phase === 'connected';
  const received = pairing.receivedImage;
  const imageSrc = received ? `data:${received.mime};base64,${received.data}` : null;
  const localImage = localContent?.kind === 'image' ? localContent.dataUrl : null;
  const localCode = localContent?.kind === 'code' ? localContent.text : null;
  const displayImage = localImage ?? imageSrc;

  const handleLocalImage = useCallback((dataUrl: string) => {
    setLocalContent({ kind: 'image', dataUrl });
  }, []);

  const handleLocalCode = useCallback((text: string) => {
    setLocalContent({ kind: 'code', text });
  }, []);

  const clearLocalContent = useCallback(() => {
    setLocalContent(null);
  }, []);

  const handleJoin = () => {
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    void pairing.joinRoom(trimmed);
  };

  if (connected) {
    return (
      <FullScreenProjector
        imageUri={displayImage}
        localCode={localCode}
        showingLocal={localContent !== null}
        onLocalImage={handleLocalImage}
        onLocalCode={handleLocalCode}
        onClearLocal={clearLocalContent}
        sendViewport={pairing.sendViewport}
        onDisconnect={() => { pairing.reset(); setCodeInput(''); setLocalContent(null); }}
      />
    );
  }

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
              Enter the session code from Admin to connect. This screen then goes full-screen and shows exactly
              what Admin places in its phone frame.
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

            {localContent ? (
              <View style={[styles.localPreview, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">Local preview</ThemedText>
                {localCode ? (
                  <ScrollView style={styles.localCodeScroll} contentContainerStyle={styles.codeContent}>
                    <Text selectable style={styles.codeText}>{localCode}</Text>
                  </ScrollView>
                ) : (
                  <Image source={{ uri: localImage ?? '' }} style={styles.localPreviewImage} resizeMode="contain" />
                )}
                <Pressable accessibilityRole="button" onPress={clearLocalContent}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>Clear local content</ThemedText>
                </Pressable>
              </View>
            ) : null}

            <ProjectorDropZone onImage={handleLocalImage} onCode={handleLocalCode} />
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type FullScreenProps = {
  imageUri: string | null;
  localCode: string | null;
  showingLocal: boolean;
  onLocalImage: (dataUrl: string) => void;
  onLocalCode: (text: string) => void;
  onClearLocal: () => void;
  sendViewport: (viewport: Viewport) => void;
  onDisconnect: () => void;
};

/**
 * Connected Projector: the whole screen is the stage Admin composes. The
 * screen size is reported so Admin's phone frame matches it pixel for pixel.
 */
function FullScreenProjector({
  imageUri,
  localCode,
  showingLocal,
  onLocalImage,
  onLocalCode,
  onClearLocal,
  sendViewport,
  onDisconnect,
}: FullScreenProps) {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const { width, height } = useWindowDimensions();
  const [controlsVisible, setControlsVisible] = useState(false);

  // Re-report on rotation, browser full-screen, or window resize.
  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const timer = setTimeout(() => sendViewport({ w: width, h: height, dpr: PixelRatio.get() }), 150);
    return () => clearTimeout(timer);
  }, [height, sendViewport, width]);

  const enterFullscreen = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    setControlsVisible(false);
  }, []);

  return (
    <View style={styles.fullscreen}>
      <StatusBar hidden />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show Projector controls"
        style={StyleSheet.absoluteFill}
        onPress={() => setControlsVisible((visible) => !visible)}>
        {localCode ? (
          <ScrollView style={styles.fullscreenCode} contentContainerStyle={styles.codeContent}>
            <Text selectable style={styles.codeText}>{localCode}</Text>
          </ScrollView>
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <View style={styles.fullscreenWaiting}>
            <Text style={styles.fullscreenWaitingTitle}>Connected to Admin</Text>
            <Text style={styles.fullscreenWaitingHint}>
              Waiting for Admin to place something on the Projector screen. Tap for options.
            </Text>
          </View>
        )}
      </Pressable>

      {controlsVisible ? (
        <View style={styles.controlsSheet}>
          <View style={styles.controlsRow}>
            {Platform.OS === 'web' ? (
              <Pressable accessibilityRole="button" onPress={enterFullscreen} style={styles.controlBtn}>
                <Text style={styles.controlText}>⤢ Full screen</Text>
              </Pressable>
            ) : null}
            {showingLocal ? (
              <Pressable accessibilityRole="button" onPress={onClearLocal} style={styles.controlBtn}>
                <Text style={styles.controlText}>Show Admin content</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={onDisconnect} style={styles.controlBtn}>
              <Text style={[styles.controlText, styles.controlDanger]}>Disconnect</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setControlsVisible(false)} style={styles.controlBtn}>
              <Text style={styles.controlText}>Hide</Text>
            </Pressable>
          </View>
          <ProjectorDropZone onImage={onLocalImage} onCode={onLocalCode} />
        </View>
      ) : null}
    </View>
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  codeContent: { padding: Spacing.three },
  codeText: { fontFamily: 'monospace', fontSize: 15, lineHeight: 22, color: '#E8EAED' },
  localPreview: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  localCodeScroll: { maxHeight: 220, backgroundColor: '#05070A', borderRadius: 10 },
  fullscreen: { flex: 1, backgroundColor: '#000000' },
  fullscreenCode: { flex: 1, backgroundColor: '#05070A' },
  fullscreenWaiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  fullscreenWaitingTitle: { color: '#E8EAED', fontSize: 20, fontWeight: '600', textAlign: 'center' },
  fullscreenWaitingHint: { color: '#8A93A0', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 360 },
  controlsSheet: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    backgroundColor: 'rgba(21,25,30,0.94)',
    borderWidth: 1,
    borderColor: '#2C333C',
  },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  controlBtn: {
    borderWidth: 1,
    borderColor: '#2C333C',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#20262D',
  },
  controlText: { color: '#F4F6F8', fontSize: 14, fontWeight: '600' },
  controlDanger: { color: '#FF7A70' },
  localPreviewImage: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#05070A' },
});
