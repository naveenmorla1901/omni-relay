import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
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
import { CONFIG } from '@/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { enhanceCapture, rotateImage } from '@/lib/cv';
import { detectAndOverlay, smoothQuad, warpAndCrop } from '@/lib/quad';
import type { QuadCorners } from '@/lib/quad';
import { downloadCapture } from '@/lib/download';
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
  const { width, height } = useWindowDimensions();
  const lock = useSessionStore((s) => s.lock);
  const pairing = usePairing('admin');
  const [sendMode, setSendMode] = useState<SendMode>('code');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('');
  const [gallery, setGallery] = useState<CapturedFrame[]>([]);
  const [activeCapture, setActiveCapture] = useState<CapturedFrame | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<QuadCorners | null>(null);
  const [previewOverlayUrl, setPreviewOverlayUrl] = useState<string | null>(null);
  const [quadProcessing, setQuadProcessing] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [autoCropEnabled, setAutoCropEnabled] = useState<boolean>(CONFIG.AUTO_CROP_ON_DETECT);
  const [preCrop, setPreCrop] = useState<CapturedFrame | null>(null);
  const [wasCropped, setWasCropped] = useState(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const previousQuadRef = useRef<QuadCorners | null>(null);
  const lastRedetectRef = useRef(0);
  const detectionIdRef = useRef(0);
  const cropIdRef = useRef(0);
  const wide = width >= 1000;
  const recorderLive = pairing.phase === 'connected';
  const projectorReady = pairing.projectorJoined;

  const detectCapture = useCallback((frame: CapturedFrame) => {
    const requestId = ++detectionIdRef.current;
    setDetectedCorners(null);
    setPreviewOverlayUrl(null);
    setQuadProcessing(true);
    void detectAndOverlay(frame.dataUrl).then(({ corners, overlayDataUrl }) => {
      // Ignore a slow result if a newer capture/detection has started.
      if (requestId !== detectionIdRef.current) return;
      const smoothed = corners
        ? smoothQuad(
            previousQuadRef.current,
            corners,
            frame.width,
            frame.height,
            CONFIG.QUAD_SMOOTHING_ALPHA,
            CONFIG.QUAD_MOVE_THRESHOLD,
          )
        : null;
      previousQuadRef.current = smoothed;
      setDetectedCorners(smoothed);
      setPreviewOverlayUrl(overlayDataUrl);
      setQuadProcessing(false);
    });
  }, []);

  const captureStill = useCallback(() => {
    const video = videoElementRef.current;
    if (!video) return;
    const frame = captureFromVideo(video);
    if (!frame) return;
    setGallery((prev) => [frame, ...prev].slice(0, 20));
    setActiveCapture(frame);
    setSendStatus(null);
    setDownloadStatus(null);
    cropIdRef.current++;
    setPreCrop(null);
    setWasCropped(false);
    previousQuadRef.current = null;
    detectCapture(frame);
  }, [detectCapture]);

  const downloadActive = useCallback(() => {
    if (!activeCapture) return;
    downloadCapture(activeCapture.dataUrl, `clearrelay-${activeCapture.id}.jpg`);
    setDownloadStatus('Downloaded');
    setTimeout(() => setDownloadStatus(null), 2500);
  }, [activeCapture]);

  // Recorder's Re-lock button asks the Admin to re-run detection over Link A.
  useEffect(() => {
    if (pairing.redetectRequested === 0) {
      lastRedetectRef.current = 0;
      return;
    }
    if (pairing.redetectRequested <= lastRedetectRef.current) return;
    lastRedetectRef.current = pairing.redetectRequested;
    if (!activeCapture) return;
    const timer = setTimeout(() => detectCapture(activeCapture), 0);
    return () => clearTimeout(timer);
  }, [activeCapture, detectCapture, pairing.redetectRequested]);

  const rotateCW = useCallback(async () => {
    if (!activeCapture) return;
    cropIdRef.current++;
    const newDataUrl = await rotateImage(activeCapture.dataUrl, 90);
    const updated: CapturedFrame = {
      ...activeCapture,
      dataUrl: newDataUrl,
      width: activeCapture.height,
      height: activeCapture.width,
    };
    setActiveCapture(updated);
    setGallery((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, [activeCapture]);

  const rotateCCW = useCallback(async () => {
    if (!activeCapture) return;
    cropIdRef.current++;
    const newDataUrl = await rotateImage(activeCapture.dataUrl, -90);
    const updated: CapturedFrame = {
      ...activeCapture,
      dataUrl: newDataUrl,
      width: activeCapture.height,
      height: activeCapture.width,
    };
    setActiveCapture(updated);
    setGallery((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, [activeCapture]);

  const autoCrop = useCallback(async () => {
    if (!activeCapture || !detectedCorners) return;
    const cropId = ++cropIdRef.current;
    const source = activeCapture;
    const newDataUrl = await warpAndCrop(source.dataUrl, detectedCorners);
    if (cropId !== cropIdRef.current) return;
    const img = new window.Image();
    img.onload = () => {
      if (cropId !== cropIdRef.current) return;
      const cropped: CapturedFrame = {
        ...source,
        id: `${source.id}-crop-${Date.now()}`,
        ts: Date.now(),
        dataUrl: newDataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      setPreCrop((previous) => previous ?? source);
      setActiveCapture(cropped);
      // Keep the original in the gallery so a bad auto-crop is never lossy.
      setGallery((prev) => [cropped, ...prev].slice(0, 20));
      setDetectedCorners(null);
      setPreviewOverlayUrl(null);
      setWasCropped(true);
    };
    img.src = newDataUrl;
  }, [activeCapture, detectedCorners]);

  const undoCrop = useCallback(() => {
    if (!preCrop) return;
    cropIdRef.current++;
    setActiveCapture(preCrop);
    setGallery((prev) => prev.map((f) => (f.id === preCrop.id ? preCrop : f)));
    setPreCrop(null);
    setDetectedCorners(null);
    setPreviewOverlayUrl(null);
    setWasCropped(false);
  }, [preCrop]);

  // Auto-fit the detected screen after a short pause so the blue overlay is visible.
  useEffect(() => {
    if (!autoCropEnabled || wasCropped || quadProcessing || !detectedCorners || !activeCapture) return;
    const timer = setTimeout(() => { void autoCrop(); }, 450);
    return () => clearTimeout(timer);
  }, [activeCapture, autoCrop, autoCropEnabled, detectedCorners, quadProcessing, wasCropped]);

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
            <View style={[styles.pane, styles.paneLeft, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
                      mirror={pairing.remoteCameraMirrored}
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
                              onPress={() => { cropIdRef.current++; setActiveCapture(frame); setDetectedCorners(null); setPreviewOverlayUrl(null); setDownloadStatus(null); setPreCrop(null); setWasCropped(false); }}
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

                  {activeCapture && (
                    <View style={[styles.captureSection, { borderColor: theme.border }]}>
                      <Image
                        source={{ uri: previewOverlayUrl ?? activeCapture.dataUrl }}
                        style={[styles.capturePreviewLarge, { backgroundColor: '#05070A' }]}
                        resizeMode="contain"
                      />
                      <View style={styles.row}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void rotateCCW()}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="small">↺ Rotate CCW</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void rotateCW()}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="small">↻ Rotate CW</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => { setZoomScale(1); setZoomVisible(true); }}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="small">⤢ Zoom</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={downloadActive}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.success, backgroundColor: pressed ? theme.backgroundSelected : 'rgba(0,200,100,0.10)' },
                          ]}>
                          <ThemedText type="smallBold" style={{ color: theme.success }}>⬇ Download</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={quadProcessing}
                          onPress={() => detectCapture(activeCapture)}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent', opacity: quadProcessing ? 0.5 : 1 },
                          ]}>
                          <ThemedText type="small">{quadProcessing ? 'Detecting…' : '⌕ Detect again'}</ThemedText>
                        </Pressable>
                        {detectedCorners && (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void autoCrop()}
                            style={({ pressed }) => [
                              styles.iconBtn,
                              { borderColor: theme.accent, backgroundColor: pressed ? theme.backgroundSelected : 'rgba(0,122,255,0.08)' },
                            ]}>
                            <ThemedText type="small" style={{ color: theme.accent }}>⊡ Auto-crop</ThemedText>
                          </Pressable>
                        )}
                      </View>
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                        {activeCapture.width} × {activeCapture.height} · {new Date(activeCapture.ts).toLocaleTimeString()}
                        {wasCropped ? '  · Cropped' : quadProcessing ? '  · Detecting…' : detectedCorners ? '  · Screen detected' : '  · No screen detected'}
                        {downloadStatus ? `  · ${downloadStatus}` : ''}
                      </ThemedText>
                      {!quadProcessing && !detectedCorners && !wasCropped && (
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                          No screen found. Try a straighter angle or press Re-lock on the Recorder, then Detect again.
                        </ThemedText>
                      )}
                      <View style={styles.row}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setAutoCropEnabled((enabled) => !enabled)}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: autoCropEnabled ? theme.success : theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="small" style={{ color: autoCropEnabled ? theme.success : theme.text }}>
                            {autoCropEnabled ? '☑' : '☐'} Auto-crop detected screen
                          </ThemedText>
                        </Pressable>
                        {preCrop && (
                          <Pressable
                            accessibilityRole="button"
                            onPress={undoCrop}
                            style={({ pressed }) => [
                              styles.iconBtn,
                              { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                            ]}>
                            <ThemedText type="small">↶ Undo crop</ThemedText>
                          </Pressable>
                        )}
                      </View>
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
            <View style={[styles.pane, styles.paneRight, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
                </View>
              ) : (
                <View style={[styles.imageDrop, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">No capture selected</ThemedText>
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

      {/* ── Zoom modal ───────────────────────────────────────────── */}
      <Modal visible={zoomVisible} transparent animationType="fade" onRequestClose={() => setZoomVisible(false)}>
        <View style={styles.zoomOverlay}>
          <View style={styles.zoomToolbar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setZoomScale((scale) => Math.max(1, scale - 1))}
              style={styles.zoomBtn}>
              <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>−</ThemedText>
            </Pressable>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>{zoomScale}×</ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setZoomScale((scale) => Math.min(4, scale + 1))}
              style={styles.zoomBtn}>
              <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>+</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setZoomVisible(false); setZoomScale(1); }}
              style={styles.zoomBtn}>
              <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Close</ThemedText>
            </Pressable>
          </View>
          <ScrollView
            style={styles.zoomScroll}
            contentContainerStyle={{ width: width * zoomScale, height: height * zoomScale }}
            showsHorizontalScrollIndicator
            showsVerticalScrollIndicator>
            <Image
              source={{ uri: activeCapture?.dataUrl ?? '' }}
              style={{ width: width * zoomScale, height: height * zoomScale }}
              resizeMode="contain"
            />
          </ScrollView>
        </View>
      </Modal>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: Spacing.three },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  secondaryBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  workspace: { gap: Spacing.three },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  pane: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.three },
  paneLeft: { flex: 2 },
  paneRight: { flex: 1 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  videoBox: { height: 340, borderWidth: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#05070A' },
  galleryWrap: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  thumb: { borderRadius: 8, overflow: 'hidden', marginRight: Spacing.two, alignItems: 'center' },
  thumbImg: { width: 96, height: 72, borderRadius: 6 },
  captureSection: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  capturePreviewLarge: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  iconBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  codeInput: { minHeight: 190, borderWidth: 1, borderRadius: 12, fontSize: 14, lineHeight: 20, padding: Spacing.three },
  langInput: { borderWidth: 1, borderRadius: 12, fontSize: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  imageDrop: { minHeight: 200, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  capturePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#05070A' },
  sendBtn: { alignItems: 'center', borderRadius: 12, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  zoomToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingTop: 48, paddingBottom: Spacing.three },
  zoomBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  zoomScroll: { flex: 1 },
});
