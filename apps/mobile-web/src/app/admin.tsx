import { Link } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoView } from '@/components/video-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { enhanceCapture } from '@/lib/cv';
import { useSessionStore } from '@/store/session';

type SendMode = 'image' | 'code';

type CapturedFrame = {
  id: string;
  ts: number;
  dataUrl: string;
  width: number;
  height: number;
};

export default function AdminScreen() {
  return (
    <AccessBoundary>
      <AdminWorkspace />
    </AccessBoundary>
  );
}

function captureFromVideo(video: HTMLVideoElement): CapturedFrame | null {
  const dataUrl = enhanceCapture(video);
  if (!dataUrl) return null;
  return {
    id: String(Date.now()),
    ts: Date.now(),
    dataUrl,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

function AdminWorkspace() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const lock = useSessionStore((s) => s.lock);
  const pairing = usePairing('admin');
  const [sendMode, setSendMode] = useState<SendMode>('code');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('');
  const [gallery, setGallery] = useState<CapturedFrame[]>([]);
  const [activeCapture, setActiveCapture] = useState<CapturedFrame | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const wide = width >= 1000;
  const recorderLive = pairing.phase === 'connected';
  const projectorReady = pairing.projectorJoined;

  const captureStill = useCallback(() => {
    const video = videoElementRef.current;
    if (!video) return;
    const frame = captureFromVideo(video);
    if (!frame) return;
    setGallery((prev) => [frame, ...prev].slice(0, 20));
    setActiveCapture(frame);
    setSendMode('image');
    setSendStatus(null);
  }, []);

  const handleSendToProjector = useCallback(() => {
    if (sendMode === 'image' && activeCapture) {
      pairing.pushImage(activeCapture.dataUrl);
      setSendStatus('Sent!');
      setTimeout(() => setSendStatus(null), 2500);
    }
  }, [sendMode, activeCapture, pairing]);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* ── Top bar ──────────────────────────────────────────── */}
          <View style={styles.topbar}>
            <Link href="/" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>← All roles</ThemedText>
              </Pressable>
            </Link>
            <View style={styles.topbarRight}>
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
          </View>

          {/* ── Heading ──────────────────────────────────────────── */}
          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>Admin</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Create a session, share the code with Recorder and Projector, then watch and capture.
            </ThemedText>
          </View>

          {/* ── Session panel ────────────────────────────────────── */}
          <View style={[styles.sessionPanel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>

            {/* Header row: status chips */}
            <View style={styles.sessionHeader}>
              <ThemedText type="smallBold">Session</ThemedText>
              <View style={styles.chipRow}>
                <DeviceChip label="Recorder" connected={pairing.recorderJoined} />
                <DeviceChip label="Projector" connected={pairing.projectorJoined} />
              </View>
            </View>

            {/* Idle / failed: create session button */}
            {(pairing.phase === 'idle' || pairing.phase === 'failed') && (
              <>
                {pairing.phase === 'failed' && pairing.error ? (
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>{pairing.error}</ThemedText>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pairing.createRoom()}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                    Create session
                  </ThemedText>
                </Pressable>
              </>
            )}

            {/* Creating: spinner */}
            {pairing.phase === 'creating' && (
              <View style={styles.row}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary">Connecting to server…</ThemedText>
              </View>
            )}

            {/* Room code — show while waiting or connected */}
            {pairing.roomCode && pairing.phase !== 'idle' && pairing.phase !== 'creating' && (
              <View style={[styles.codeBlock, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">Share this code</ThemedText>
                <ThemedText style={[styles.bigCode, { color: theme.text, letterSpacing: 10 }]}>
                  {pairing.roomCode}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Enter it in the Recorder and Projector apps to connect.
                </ThemedText>
              </View>
            )}

            {/* Waiting: device status details */}
            {(pairing.phase === 'waiting-for-peer' || pairing.phase === 'exchanging' || pairing.phase === 'connecting') && (
              <View style={styles.deviceStatusList}>
                <DeviceStatusRow
                  label="Recorder"
                  joined={pairing.recorderJoined}
                  note={pairing.phase === 'exchanging' && pairing.recorderJoined ? 'Pairing…' : undefined}
                />
                <DeviceStatusRow label="Projector" joined={pairing.projectorJoined} />
              </View>
            )}

            {/* Connected */}
            {pairing.phase === 'connected' && (
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <ThemedText type="small" style={{ color: theme.success }}>Session active</ThemedText>
              </View>
            )}

            {/* End session button when a room exists */}
            {pairing.roomCode && (
              <Pressable
                accessibilityRole="button"
                onPress={() => pairing.reset()}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                ]}>
                <ThemedText type="smallBold">End session</ThemedText>
              </Pressable>
            )}
          </View>

          {/* ── Workspace ────────────────────────────────────────── */}
          <View style={[styles.workspace, wide && styles.workspaceWide]}>

            {/* Left pane: live feed */}
            <View style={[styles.pane, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.paneHeader}>
                <ThemedText type="smallBold">Live feed</ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  {recorderLive ? 'LINK A · LIVE' : 'LINK A · WAITING'}
                </ThemedText>
              </View>

              {recorderLive ? (
                <>
                  <View style={[styles.videoBox, { borderColor: theme.border }]}>
                    <VideoView
                      stream={pairing.remoteStream}
                      placeholder="Waiting for camera…"
                      onVideoElement={(el) => { videoElementRef.current = el as HTMLVideoElement | null; }}
                    />
                  </View>

                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={captureStill}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.accentText }}>Capture still</ThemedText>
                    </Pressable>
                    {gallery.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {gallery.length} capture{gallery.length !== 1 ? 's' : ''}
                      </ThemedText>
                    )}
                  </View>

                  {gallery.length > 0 && (
                    <View style={[styles.galleryWrap, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                        Gallery — tap to select
                      </ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {gallery.map((frame) => {
                          const active = activeCapture?.id === frame.id;
                          return (
                            <Pressable
                              key={frame.id}
                              onPress={() => { setActiveCapture(frame); setSendMode('image'); }}
                              style={[
                                styles.thumb,
                                { borderColor: active ? theme.accent : theme.border, borderWidth: active ? 2 : 1 },
                              ]}>
                              <Image source={{ uri: frame.dataUrl }} style={styles.thumbImg} resizeMode="cover" />
                              <ThemedText type="code" themeColor="textSecondary" style={{ fontSize: 10, marginBottom: 2 }}>
                                {frame.width}×{frame.height}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {pairing.recorderJoined
                    ? 'Recorder joined. Establishing video link…'
                    : 'Live feed appears here once Recorder connects.'}
                </ThemedText>
              )}
            </View>

            {/* Right pane: send to Projector */}
            <View style={[styles.pane, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.paneHeader}>
                <ThemedText type="smallBold">Send to Projector</ThemedText>
                <ThemedText type="code" themeColor={projectorReady ? 'text' : 'textSecondary'}>
                  {projectorReady ? 'LINK B · READY' : 'LINK B · WAITING'}
                </ThemedText>
              </View>

              <View style={styles.tabs}>
                {(['image', 'code'] as const).map((tab) => {
                  const active = sendMode === tab;
                  return (
                    <Pressable
                      key={tab}
                      accessibilityRole="tab"
                      onPress={() => setSendMode(tab)}
                      style={[
                        styles.tab,
                        { backgroundColor: active ? theme.backgroundSelected : 'transparent', borderColor: active ? theme.accent : theme.border },
                      ]}>
                      <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>
                        {tab === 'image' ? 'Image' : 'Code'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {sendMode === 'code' ? (
                <View style={{ gap: Spacing.two }}>
                  <TextInput
                    multiline
                    value={code}
                    onChangeText={setCode}
                    placeholder="Paste or type code to show on the Projector…"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    style={[styles.codeInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    textAlignVertical="top"
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={language}
                    onChangeText={setLanguage}
                    placeholder="Language (optional)"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    style={[styles.langInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>
              ) : activeCapture ? (
                <View style={{ gap: Spacing.two, alignItems: 'center' }}>
                  <Image
                    source={{ uri: activeCapture.dataUrl }}
                    style={styles.capturePreview}
                    resizeMode="contain"
                  />
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                    {activeCapture.width} × {activeCapture.height} · {new Date(activeCapture.ts).toLocaleTimeString()}
                  </ThemedText>
                  <Pressable
                    onPress={() => setActiveCapture(null)}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { alignSelf: 'flex-end', borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                    ]}>
                    <ThemedText type="small" themeColor="textSecondary">Clear</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.imageDrop, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">No capture yet</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {recorderLive ? 'Press "Capture still" to grab a frame.' : 'Connect Recorder first, then capture.'}
                  </ThemedText>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={!projectorReady || !(sendMode === 'image' && activeCapture)}
                onPress={handleSendToProjector}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: (!projectorReady || !(sendMode === 'image' && activeCapture)) ? 0.4 : pressed ? 0.8 : 1,
                  },
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  {sendStatus ?? 'Send to Projector'}
                </ThemedText>
              </Pressable>
              {!projectorReady && (
                <ThemedText type="small" themeColor="textSecondary">
                  Projector must connect to this session first.
                </ThemedText>
              )}
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// ── Small reusable pieces ──────────────────────────────────────────────────────

function DeviceChip({ label, connected }: { label: string; connected: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { borderColor: connected ? theme.success : theme.border }]}>
      <View style={[styles.dot, { backgroundColor: connected ? theme.success : theme.textSecondary }]} />
      <ThemedText type="small" themeColor={connected ? 'text' : 'textSecondary'}>{label}</ThemedText>
    </View>
  );
}

function DeviceStatusRow({ label, joined, note }: { label: string; joined: boolean; note?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.deviceRow}>
      <View style={[styles.dot, { backgroundColor: joined ? theme.success : theme.textSecondary }]} />
      <ThemedText type="small" themeColor={joined ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto' }}>
        {note ?? (joined ? 'Connected' : 'Waiting…')}
      </ThemedText>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  topbarRight: { flexDirection: 'row', gap: Spacing.two },
  lockBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  heading: { gap: Spacing.two, maxWidth: 760 },
  title: { fontSize: 44, lineHeight: 50 },
  subtitle: { fontSize: 17, lineHeight: 26 },
  sessionPanel: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.three },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  chipRow: { flexDirection: 'row', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  codeBlock: { borderWidth: 1, borderRadius: 16, padding: Spacing.four, alignItems: 'center', gap: Spacing.two },
  bigCode: { fontSize: 42, fontWeight: '700', fontFamily: 'monospace' },
  deviceStatusList: { gap: Spacing.two },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: Spacing.three },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  secondaryBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  workspace: { gap: Spacing.three },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  pane: { flex: 1, borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.three },
  paneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  videoBox: { height: 340, borderWidth: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#05070A' },
  galleryWrap: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  thumb: { borderRadius: 8, overflow: 'hidden', marginRight: Spacing.two, alignItems: 'center' },
  thumbImg: { width: 96, height: 72, borderRadius: 6 },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  codeInput: { minHeight: 190, borderWidth: 1, borderRadius: 12, fontSize: 14, lineHeight: 20, padding: Spacing.three },
  langInput: { borderWidth: 1, borderRadius: 12, fontSize: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  imageDrop: { minHeight: 200, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  capturePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#05070A' },
  sendBtn: { alignItems: 'center', borderRadius: 12, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
});
