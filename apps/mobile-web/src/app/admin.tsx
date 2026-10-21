import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { ProjectorStage } from '@/components/projector-stage';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoView } from '@/components/video-view';
import { isTextQualityResolution } from '@/camera/lenses';
import { APP_BUILD, CONFIG } from '@/config';
import { Spacing } from '@/constants/theme';
import { usePairing } from '@/hooks/use-pairing';
import { useTheme } from '@/hooks/use-theme';
import { captureAndEnhanceVideo, rotateImage } from '@/lib/cv';
import { detectAndOverlay, smoothQuad, warpAndCrop } from '@/lib/quad';
import type { QuadCorners } from '@/lib/quad';
import { downloadCapture } from '@/lib/download';
import { useSessionStore } from '@/store/session';

type DeletePrompt = { kind: 'capture'; id: string } | { kind: 'all' };

type SoftEdge = 'top' | 'bottom' | 'left' | 'right';

type CapturedFrame = {
  id: string;
  ts: number;
  dataUrl: string;
  width: number;
  height: number;
  /** Side that measured out of focus, in this frame's (rotated) orientation. */
  softEdge?: SoftEdge | null;
};

const CW_EDGE: Record<SoftEdge, SoftEdge> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };

function rotateEdge(edge: SoftEdge | null, rotation: FeedRotation): SoftEdge | null {
  let turned = edge;
  for (let turn = 0; turned && turn < rotation / 90; turn++) turned = CW_EDGE[turned];
  return turned;
}

export default function AdminScreen() {
  return (
    <AccessBoundary>
      <AdminWorkspace />
    </AccessBoundary>
  );
}

type FeedRotation = 0 | 90 | 180 | 270;
const FEED_ROTATIONS: FeedRotation[] = [0, 90, 180, 270];
const FEED_ROTATION_KEY = 'clearrelay.feedRotation';

/** Remembered per browser so a sideways Recorder stays upright next session. */
function readFeedRotation(): FeedRotation {
  try {
    const stored = Number(globalThis.localStorage?.getItem(FEED_ROTATION_KEY));
    return FEED_ROTATIONS.includes(stored as FeedRotation) ? (stored as FeedRotation) : 0;
  } catch {
    return 0;
  }
}

function storeFeedRotation(rotation: FeedRotation) {
  try {
    globalThis.localStorage?.setItem(FEED_ROTATION_KEY, String(rotation));
  } catch {
    // Private mode: the rotation just is not remembered.
  }
}

/** Captures come out turned like the live view, so they are upright too. */
async function captureFromVideo(video: HTMLVideoElement, rotation: FeedRotation): Promise<CapturedFrame | null> {
  const capture = await captureAndEnhanceVideo(video);
  if (!capture) return null;
  const now = Date.now();
  const frame = { id: String(now), ts: now, ...capture };
  if (rotation === 0) return frame;
  const sideways = rotation === 90 || rotation === 270;
  return {
    ...frame,
    dataUrl: await rotateImage(capture.dataUrl, rotation),
    width: sideways ? capture.height : capture.width,
    height: sideways ? capture.width : capture.height,
    softEdge: rotateEdge(capture.softEdge, rotation),
  };
}

function AdminWorkspace() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const lock = useSessionStore((s) => s.lock);
  const pairing = usePairing('admin');
  const [gallery, setGallery] = useState<CapturedFrame[]>([]);
  const [activeCapture, setActiveCapture] = useState<CapturedFrame | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [zoomVisible, setZoomVisible] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<QuadCorners | null>(null);
  const [previewOverlayUrl, setPreviewOverlayUrl] = useState<string | null>(null);
  const [quadProcessing, setQuadProcessing] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [autoCropEnabled, setAutoCropEnabled] = useState<boolean>(CONFIG.AUTO_CROP_ON_DETECT);
  const [preCrop, setPreCrop] = useState<CapturedFrame | null>(null);
  const [wasCropped, setWasCropped] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [remoteResolution, setRemoteResolution] = useState<{ width: number; height: number } | null>(null);
  const captureInFlightRef = useRef(false);
  const previousQuadRef = useRef<QuadCorners | null>(null);
  const lastRedetectRef = useRef(0);
  const detectionIdRef = useRef(0);
  const cropIdRef = useRef(0);
  const wide = width >= 1000;
  // The live feed takes the left of the screen, the phone stage the right.
  const [feedRotation, setFeedRotation] = useState<FeedRotation>(readFeedRotation);
  const feedSideways = feedRotation === 90 || feedRotation === 270;
  // Live feed on the left, the Projector stage (phone + its controls) gets the larger right side.
  const rightPaneWidth = Math.round(Math.min(980, Math.max(480, width * 0.55)));
  const leftPaneWidth = width - rightPaneWidth - Spacing.three * 3;
  const videoHeight = wide
    ? Math.max(300, Math.min(Math.round(height - 190), Math.round(leftPaneWidth * (feedSideways ? 1.1 : 0.75))))
    : Math.max(260, Math.round(width * 0.7));
  const recorderLive = pairing.phase === 'connected';
  const projectorReady = pairing.projectorJoined;
  const remoteLowResolution = Boolean(
    remoteResolution && !isTextQualityResolution(remoteResolution.width, remoteResolution.height),
  );

  const changeFeedRotation = useCallback((rotation: FeedRotation) => {
    setFeedRotation(rotation);
    storeFeedRotation(rotation);
  }, []);

  const attachVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el;
    setVideoElement((current) => (current === el ? current : el));
    if (!el) {
      setRemoteResolution(null);
      return;
    }
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      setRemoteResolution({ width: el.videoWidth, height: el.videoHeight });
    }
  }, []);

  useEffect(() => {
    if (!videoElement) return;

    const updateResolution = () => {
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        setRemoteResolution({ width: videoElement.videoWidth, height: videoElement.videoHeight });
      }
    };

    videoElement.addEventListener('loadedmetadata', updateResolution);
    videoElement.addEventListener('resize', updateResolution);
    return () => {
      videoElement.removeEventListener('loadedmetadata', updateResolution);
      videoElement.removeEventListener('resize', updateResolution);
    };
  }, [videoElement]);

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

  const captureStill = useCallback(async () => {
    const video = videoElementRef.current;
    if (!video || captureInFlightRef.current) return;

    captureInFlightRef.current = true;
    setCaptureBusy(true);
    try {
      const frame = await captureFromVideo(video, feedRotation);
      if (!frame) return;
      setGallery((prev) => [frame, ...prev].slice(0, 20));
      setActiveCapture(frame);
      setDownloadStatus(null);
      cropIdRef.current++;
      setPreCrop(null);
      setWasCropped(false);
      previousQuadRef.current = null;
      detectCapture(frame);
    } catch (error) {
      console.warn('Could not capture still.', error);
    } finally {
      captureInFlightRef.current = false;
      setCaptureBusy(false);
    }
  }, [detectCapture, feedRotation]);

  const downloadActive = useCallback(() => {
    if (!activeCapture) return;
    downloadCapture(activeCapture.dataUrl, `clearrelay-${activeCapture.id}.jpg`);
    setDownloadStatus('Downloaded');
    setTimeout(() => setDownloadStatus(null), 2500);
  }, [activeCapture]);

  const resetCaptureView = useCallback(() => {
    cropIdRef.current++;
    detectionIdRef.current++;
    previousQuadRef.current = null;
    setDetectedCorners(null);
    setPreviewOverlayUrl(null);
    setQuadProcessing(false);
    setPreCrop(null);
    setWasCropped(false);
    setDownloadStatus(null);
    setZoomVisible(false);
    setZoomScale(1);
  }, []);

  const deleteCapture = useCallback((id: string) => {
    const remaining = gallery.filter((frame) => frame.id !== id);
    setGallery(remaining);
    if (preCrop?.id === id) setPreCrop(null);
    if (activeCapture?.id === id) {
      setActiveCapture(remaining[0] ?? null);
      resetCaptureView();
    }
  }, [activeCapture, gallery, preCrop, resetCaptureView]);

  const confirmDelete = useCallback(() => {
    if (!deletePrompt) return;
    if (deletePrompt.kind === 'all') {
      setGallery([]);
      setActiveCapture(null);
      resetCaptureView();
    } else {
      deleteCapture(deletePrompt.id);
    }
    setDeletePrompt(null);
  }, [deleteCapture, deletePrompt, resetCaptureView]);

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

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* ── Session bar ─────────────────────────────────────── */}
          <View style={[styles.sessionBar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Link href="/" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>← Roles</ThemedText>
              </Pressable>
            </Link>
            <ThemedText type="smallBold" style={styles.barTitle}>Admin</ThemedText>

            {pairing.roomCode ? (
              <View style={[styles.codePill, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <ThemedText type="small" themeColor="textSecondary">Code</ThemedText>
                <ThemedText selectable style={[styles.barCode, { color: theme.text }]}>{pairing.roomCode}</ThemedText>
              </View>
            ) : pairing.phase === 'creating' ? (
              <View style={styles.row}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary">Connecting…</ThemedText>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void pairing.createRoom()}
                style={({ pressed }) => [styles.barBtn, { backgroundColor: theme.accent, borderColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>Create session</ThemedText>
              </Pressable>
            )}

            <DeviceChip
              label={recorderLive ? 'Recorder · live' : pairing.recorderJoined ? 'Recorder · linking…' : 'Recorder'}
              connected={pairing.recorderJoined || recorderLive}
            />
            <DeviceChip label="Projector" connected={projectorReady} />

            <View style={styles.barSpacer} />
            <ThemedText type="code" themeColor="textSecondary" style={{ fontSize: 11 }}>{APP_BUILD}</ThemedText>
            {pairing.roomCode ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => pairing.reset()}
                style={({ pressed }) => [styles.barBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
                <ThemedText type="small">End session</ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={lock}
              style={({ pressed }) => [styles.barBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
              <ThemedText type="small" themeColor="textSecondary">Lock</ThemedText>
            </Pressable>
          </View>

          {pairing.error ? (
            <View style={[styles.errorBox, { borderColor: theme.danger }]}>
              <ThemedText type="small" style={{ color: theme.danger }}>{pairing.error}</ThemedText>
            </View>
          ) : null}

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

              <View style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary">Rotate</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rotate live feed 90 degrees counter-clockwise"
                  onPress={() => changeFeedRotation(((feedRotation + 270) % 360) as FeedRotation)}
                  style={({ pressed }) => [styles.rotateBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
                  <ThemedText type="small">↺</ThemedText>
                </Pressable>
                {FEED_ROTATIONS.map((angle) => {
                  const active = feedRotation === angle;
                  return (
                    <Pressable
                      key={angle}
                      accessibilityRole="button"
                      accessibilityLabel={`Show live feed rotated ${angle} degrees`}
                      onPress={() => changeFeedRotation(angle)}
                      style={({ pressed }) => [
                        styles.rotateBtn,
                        {
                          borderColor: active ? theme.accent : theme.border,
                          backgroundColor: active ? theme.backgroundSelected : pressed ? theme.backgroundSelected : 'transparent',
                        },
                      ]}>
                      <ThemedText type="small" style={{ color: active ? theme.accent : theme.text, fontWeight: active ? '600' : '400' }}>
                        {angle}°
                      </ThemedText>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rotate live feed 90 degrees clockwise"
                  onPress={() => changeFeedRotation(((feedRotation + 90) % 360) as FeedRotation)}
                  style={({ pressed }) => [styles.rotateBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
                  <ThemedText type="small">↻</ThemedText>
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                  Captures follow this rotation.
                </ThemedText>
              </View>

              <View style={[styles.videoBox, { height: videoHeight, borderColor: theme.border }]}>
                {recorderLive ? (
                  <VideoView
                    stream={pairing.remoteStream}
                    placeholder="Waiting for camera…"
                    mirror={pairing.remoteCameraMirrored}
                    onVideoElement={attachVideoElement}
                    rotation={feedRotation}
                  />
                ) : (
                  <View style={styles.videoPlaceholder}>
                    <ThemedText type="small" style={{ color: '#A7B0BC', textAlign: 'center' }}>
                      {!pairing.roomCode
                        ? 'Create a session, then enter its code on the Recorder phone.'
                        : pairing.recorderJoined
                          ? 'Recorder joined. Establishing video link…'
                          : `Enter ${pairing.roomCode} on the Recorder phone to start the live feed.`}
                    </ThemedText>
                  </View>
                )}
              </View>

              {recorderLive ? (
                <>

                  {remoteLowResolution && remoteResolution && (
                    <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        The Recorder stream is only {remoteResolution.width}×{remoteResolution.height}. Small text
                        may be unreadable; ask the Recorder to use Auto/Main at up to 4K or move closer.
                      </ThemedText>
                    </View>
                  )}

                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={captureBusy ? 'Capturing sharpest frame' : 'Capture still'}
                      disabled={captureBusy}
                      onPress={() => { void captureStill(); }}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        {
                          backgroundColor: theme.accent,
                          opacity: captureBusy ? 0.55 : pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                        {captureBusy ? 'Capturing…' : 'Capture still'}
                      </ThemedText>
                    </Pressable>
                    {gallery.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {gallery.length} capture{gallery.length !== 1 ? 's' : ''}
                      </ThemedText>
                    )}
                  </View>

                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                    Best of {CONFIG.CAPTURE_SAMPLE_COUNT} live frames · adaptive contrast · edge enhancement
                  </ThemedText>

                  {gallery.length > 0 && (
                    <View style={[styles.galleryWrap, { borderColor: theme.border }]}>
                      <View style={styles.galleryHeader}>
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                          Gallery — tap to select
                        </ThemedText>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Clear all captures"
                          onPress={() => setDeletePrompt({ kind: 'all' })}
                          style={({ pressed }) => [
                            styles.galleryClear,
                            { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 12 }}>Clear all</ThemedText>
                        </Pressable>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {gallery.map((frame) => {
                          const active = activeCapture?.id === frame.id;
                          return (
                            <View key={frame.id} style={styles.thumbItem}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Select this capture"
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
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Delete this capture"
                                onPress={() => setDeletePrompt({ kind: 'capture', id: frame.id })}
                                style={({ pressed }) => [
                                  styles.thumbDelete,
                                  { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                                ]}>
                                <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 11 }}>Delete</ThemedText>
                              </Pressable>
                            </View>
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
                          accessibilityLabel="Delete this capture"
                          onPress={() => setDeletePrompt({ kind: 'capture', id: activeCapture.id })}
                          style={({ pressed }) => [
                            styles.iconBtn,
                            { borderColor: theme.danger, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                          ]}>
                          <ThemedText type="smallBold" style={{ color: theme.danger }}>Delete</ThemedText>
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
                      {activeCapture.softEdge ? (
                        <ThemedText type="small" style={{ fontSize: 12, color: theme.warning }}>
                          The {activeCapture.softEdge} of the screen was out of focus, so it was sharpened extra. For
                          crisper text there, hold the phone parallel to the monitor, or step back a little: the
                          {' '}{activeCapture.softEdge} edge is farther from the camera than its depth of focus.
                        </ThemedText>
                      ) : null}
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
              ) : null}
            </View>

            {/* Right pane: phone-shaped Projector stage */}
            <View
              style={[
                styles.pane,
                wide ? { width: rightPaneWidth } : null,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.paneHeader}>
                <ThemedText type="smallBold">Projector screen</ThemedText>
                <ThemedText type="code" themeColor={projectorReady ? 'text' : 'textSecondary'}>
                  {projectorReady ? 'LINK B · READY' : 'LINK B · WAITING'}
                </ThemedText>
              </View>
              <ProjectorStage
                viewport={pairing.projectorViewport}
                projectorReady={projectorReady}
                captureDataUrl={activeCapture?.dataUrl ?? null}
                onFrame={pairing.sendStageFrame}
                onClear={pairing.clearStage}
                resendToken={pairing.projectorEpoch}
                lastAckId={pairing.lastAckId}
                maxPreviewHeight={wide ? height - 230 : 560}
              />
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

      {/* ── Delete confirmation ───────────────────────────────────── */}
      <Modal visible={deletePrompt !== null} transparent animationType="fade" onRequestClose={() => setDeletePrompt(null)}>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ fontSize: 18 }}>
              {deletePrompt?.kind === 'all' ? 'Clear all captures?' : 'Delete this capture?'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {deletePrompt?.kind === 'all'
                ? `Remove all ${gallery.length} picture${gallery.length === 1 ? '' : 's'} from this gallery? This cannot be undone.`
                : 'Remove this picture from the gallery? This cannot be undone.'}
            </ThemedText>
            <View style={[styles.row, { justifyContent: 'flex-end' }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDeletePrompt(null)}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
                ]}>
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmDelete}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.danger, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.backgroundElement }}>
                  {deletePrompt?.kind === 'all' ? 'Clear all' : 'Delete'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    width: '100%',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  barTitle: { fontSize: 16, marginRight: Spacing.two },
  barSpacer: { flex: 1 },
  barBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  codePill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  barCode: { fontSize: 20, lineHeight: 26, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: Spacing.three },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  secondaryBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  workspace: { gap: Spacing.three },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  pane: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  paneLeft: { flex: 1, minWidth: 0 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  videoBox: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#05070A' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  galleryWrap: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  galleryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  galleryClear: { borderRadius: 6, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  thumbItem: { alignItems: 'center', marginRight: Spacing.two },
  thumb: { borderRadius: 8, overflow: 'hidden', alignItems: 'center' },
  thumbDelete: { borderRadius: 6, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  thumbImg: { width: 96, height: 72, borderRadius: 6 },
  captureSection: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  capturePreviewLarge: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  rotateBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one },
  iconBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  zoomToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingTop: 48, paddingBottom: Spacing.three },
  zoomBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  zoomScroll: { flex: 1 },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  confirmCard: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 16, padding: Spacing.four, gap: Spacing.three },
});
