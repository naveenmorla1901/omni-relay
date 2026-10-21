import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createCameraSource } from '@/camera';
import type { CameraDevice, ICameraSource } from '@/camera';
import { buildLensOptions, isTextQualityResolution } from '@/camera/lenses';
import { AccessBoundary } from '@/components/access-boundary';
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
  const lock = useSessionStore((s) => s.lock);
  const pairing = usePairing('recorder');
  const [codeInput, setCodeInput] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<{ width: number; height: number; fps: number; facingMode?: string; deviceId?: string } | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [relockBusy, setRelockBusy] = useState(false);
  const cameraRef = useRef<ICameraSource | null>(null);
  const autoStartedRef = useRef(false);

  // ── Camera controls ────────────────────────────────────────────────────────

  const attachCameraStream = useCallback((camera: ICameraSource) => {
    const stream = camera.getStream();
    if (!stream) throw new Error('Camera did not return a stream.');
    setLocalStream(stream);
    const settings = camera.getActualSettings();
    setCameraSettings(settings);
    const track = stream.getVideoTracks()[0];
    if (track) pairing.attachVideoTrack(track);
    pairing.updateCameraFacingMode(settings?.facingMode, settings?.facingMode === 'user');
    return settings;
  }, [pairing]);

  const refreshCameras = useCallback(async (camera: ICameraSource) => {
    try {
      const devices = await camera.listDevices();
      if (devices.length > 0) setAvailableCameras(devices);
    } catch {
      // Lens labels are optional; Auto still works without the list.
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraBusy) return;
    setCameraBusy(true);
    setCameraError(null);
    try {
      if (!cameraRef.current) cameraRef.current = createCameraSource();
      const camera = cameraRef.current;
      const permitted = await camera.requestPermission();
      if (!permitted) throw new Error('Camera not available. Open over HTTPS and allow access.');
      camera.setFacingMode('environment');
      await camera.start('', {
        width: CONFIG.CAPTURE_RESOLUTION.width,
        height: CONFIG.CAPTURE_RESOLUTION.height,
        fps: CONFIG.CAMERA_CAPTURE_FPS,
      });
      attachCameraStream(camera);
      setSelectedDeviceId('');
      await refreshCameras(camera);
      // Let auto exposure/focus/white-balance converge before locking.
      await camera.autoAdjustForDocument();
      await new Promise((r) => setTimeout(r, CONFIG.CAMERA_AUTO_SETTLE_MS));
      await camera.lockWhiteBalance();
    } catch (err) {
      setCameraError(cameraErrMsg(err));
    } finally {
      setCameraBusy(false);
    }
  }, [attachCameraStream, cameraBusy, refreshCameras]);

  const selectLens = useCallback(async (device: CameraDevice | null) => {
    const camera = cameraRef.current;
    if (!camera || cameraBusy) return;

    const nextDeviceId = device?.id ?? '';
    if (
      nextDeviceId
        ? cameraSettings?.deviceId === nextDeviceId || selectedDeviceId === nextDeviceId
        : selectedDeviceId === '' && cameraSettings?.facingMode === 'environment'
    ) {
      return;
    }

    setCameraBusy(true);
    setCameraError(null);
    try {
      camera.setFacingMode('environment');
      await camera.start(nextDeviceId, {
        width: CONFIG.CAPTURE_RESOLUTION.width,
        height: CONFIG.CAPTURE_RESOLUTION.height,
        fps: CONFIG.CAMERA_CAPTURE_FPS,
      });
      const actual = camera.getActualSettings();
      if (
        nextDeviceId &&
        actual &&
        actual.width > 0 &&
        actual.height > 0 &&
        !isTextQualityResolution(actual.width, actual.height)
      ) {
        throw new Error(
          `This lens only delivered ${actual.width}×${actual.height}, below the 1080p text floor.`,
        );
      }
      attachCameraStream(camera);
      setSelectedDeviceId(nextDeviceId);
      await refreshCameras(camera);
      await camera.autoAdjustForDocument();
      await new Promise((r) => setTimeout(r, CONFIG.CAMERA_AUTO_SETTLE_MS));
      await camera.lockWhiteBalance();
    } catch (err) {
      const selectedError = cameraErrMsg(err);
      // A physical lens can reject 4K or be unavailable. Restore the default
      // rear camera instead of leaving the Recorder with no stream.
      try {
        camera.setFacingMode('environment');
        await camera.start('', {
          width: CONFIG.CAPTURE_RESOLUTION.width,
          height: CONFIG.CAPTURE_RESOLUTION.height,
          fps: CONFIG.CAMERA_CAPTURE_FPS,
        });
        attachCameraStream(camera);
        setSelectedDeviceId('');
        await refreshCameras(camera);
        await camera.autoAdjustForDocument();
        await new Promise((r) => setTimeout(r, CONFIG.CAMERA_AUTO_SETTLE_MS));
        await camera.lockWhiteBalance();
        setCameraError(`${selectedError} Switched back to Auto.`);
      } catch (fallbackErr) {
        setCameraError(cameraErrMsg(fallbackErr));
        setLocalStream(null);
        setCameraSettings(null);
      }
    } finally {
      setCameraBusy(false);
    }
  }, [attachCameraStream, cameraBusy, cameraSettings?.deviceId, cameraSettings?.facingMode, refreshCameras, selectedDeviceId]);

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    setLocalStream(null);
    setCameraSettings(null);
    setSelectedDeviceId('');
    setAvailableCameras([]);
  }, []);

  const relockCamera = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam || relockBusy) return;
    setRelockBusy(true);
    try {
      await cam.autoAdjustForDocument();
      await new Promise((r) => setTimeout(r, CONFIG.CAMERA_AUTO_SETTLE_MS));
      await cam.lockWhiteBalance();
      pairing.requestRedetection();
    } finally {
      setRelockBusy(false);
    }
  }, [relockBusy, pairing]);

  const flipCamera = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam?.flipCamera || cameraBusy) return;
    setCameraBusy(true);
    setCameraError(null);
    try {
      await cam.flipCamera();
      attachCameraStream(cam);
      setSelectedDeviceId('');
      await refreshCameras(cam);
      await cam.autoAdjustForDocument();
      await new Promise((r) => setTimeout(r, CONFIG.CAMERA_AUTO_SETTLE_MS));
      await cam.lockWhiteBalance();
    } catch (err) {
      setCameraError(cameraErrMsg(err));
    } finally {
      setCameraBusy(false);
    }
  }, [attachCameraStream, cameraBusy, refreshCameras]);

  useEffect(() => () => { cameraRef.current?.stop(); }, []);

  // Auto-start camera when pairing reaches connected.
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
      setTimeout(() => {
        setLocalStream(null);
        setCameraSettings(null);
        setSelectedDeviceId('');
      }, 0);
    }
  }, [pairing.phase]);

  const connected = pairing.phase === 'connected';
  const lensOptions = buildLensOptions(availableCameras);
  const selectedLensOption = lensOptions.find((option) => option.device.id === selectedDeviceId);
  const actualLensOption = lensOptions.find((option) => option.device.id === cameraSettings?.deviceId);
  const autoLensActive = selectedDeviceId === '' && cameraSettings?.facingMode !== 'user';
  const lowResolution = Boolean(
    cameraSettings && !isTextQualityResolution(cameraSettings.width, cameraSettings.height),
  );
  const currentLensLabel = cameraSettings?.facingMode === 'user'
    ? 'Front camera'
    : selectedLensOption?.label ?? (actualLensOption ? `Auto · ${actualLensOption.label}` : 'Auto · best rear');

  // ── Enter code ─────────────────────────────────────────────────────────────

  const handleJoin = () => {
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    void pairing.joinRoom(trimmed);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>

          <View style={styles.topbar}>
            <Link href="/" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>← All roles</ThemedText>
              </Pressable>
            </Link>
            <View style={styles.topbarRight}>
              <ConnChip connected={connected} label={connected ? 'Admin connected' : pairing.phase === 'failed' ? 'Failed' : 'Not connected'} danger={pairing.phase === 'failed'} />
              <Pressable
                accessibilityRole="button"
                onPress={lock}
                style={({ pressed }) => [styles.lockBtn, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">Lock</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>Recorder</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Enter the session code shown by Admin to connect.
            </ThemedText>
          </View>

          {/* ── Connection panel ──────────────────────────────────── */}
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>

            {/* Idle: code entry */}
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

            {/* Joining / exchanging / connecting: spinner */}
            {(pairing.phase === 'joining' || pairing.phase === 'exchanging' || pairing.phase === 'connecting') && (
              <View style={styles.statusRow}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary">
                  {pairing.phase === 'joining' ? 'Joining session…' : pairing.phase === 'exchanging' ? 'Exchanging connection details…' : 'Establishing link…'}
                </ThemedText>
              </View>
            )}

            {/* Connected: camera controls */}
            {connected && (
              <>
                <View style={[styles.videoBox, { borderColor: theme.border }]}>
                  <VideoView
                    stream={localStream}
                    placeholder="Starting camera…"
                    mirror={cameraSettings?.facingMode === 'user'}
                  />
                </View>

                {cameraSettings && (
                  <ThemedText
                    type="code"
                    style={{ fontSize: 12, color: lowResolution ? theme.danger : theme.textSecondary }}>
                    {cameraSettings.width}×{cameraSettings.height} · {cameraSettings.fps} fps · {currentLensLabel}
                  </ThemedText>
                )}

                {lowResolution && (
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      This stream is below 1080p, so small text may be unreadable. Use Auto/Main at up to 4K,
                      move closer, or accept a wider but softer shot.
                    </ThemedText>
                  </View>
                )}

                {localStream && (
                  <View style={[styles.lensBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <View style={styles.lensHeader}>
                      <ThemedText type="smallBold">Camera lens</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {cameraBusy ? 'Switching…' : currentLensLabel}
                      </ThemedText>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lensRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Use the default best-quality rear camera"
                        disabled={cameraBusy}
                        onPress={() => void selectLens(null)}
                        style={({ pressed }) => [
                          styles.lensChip,
                          {
                            borderColor: autoLensActive ? theme.accent : theme.border,
                            backgroundColor: autoLensActive ? theme.backgroundSelected : 'transparent',
                            opacity: cameraBusy ? 0.5 : pressed ? 0.8 : 1,
                          },
                        ]}>
                        <ThemedText type="smallBold" style={{ color: autoLensActive ? theme.accent : theme.text }}>
                          Auto · 4K preferred
                        </ThemedText>
                      </Pressable>
                      {lensOptions.map((option) => {
                        const active = selectedDeviceId === option.device.id;
                        return (
                          <Pressable
                            key={option.device.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Use the ${option.label} lens`}
                            disabled={cameraBusy}
                            onPress={() => void selectLens(option.device)}
                            style={({ pressed }) => [
                              styles.lensChip,
                              {
                                borderColor: active ? theme.accent : theme.border,
                                backgroundColor: active ? theme.backgroundSelected : 'transparent',
                                opacity: cameraBusy ? 0.5 : pressed ? 0.8 : 1,
                              },
                            ]}>
                            <ThemedText type="smallBold" style={{ color: active ? theme.accent : theme.text }}>
                              {option.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.lensHint}>
                      {lensOptions.length === 0
                        ? 'This device reports one rear camera. Auto stays at the highest resolution; Ultra-wide appears only when the phone or browser exposes it separately.'
                        : 'For text, use Auto or Main · high quality at up to 4K. Lenses below 1080p switch back to Auto to protect clarity; ultra-wide usually has fewer pixels.'}
                    </ThemedText>
                  </View>
                )}

                {cameraError && (
                  <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }}>{cameraError}</ThemedText>
                  </View>
                )}

                <ThemedText type="small" themeColor="textSecondary">
                  Keep the phone steady. Low-FPS high-resolution mode — text clarity is the priority.
                </ThemedText>

                <View style={styles.actionRow}>
                  {localStream ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={relockBusy}
                        onPress={() => void relockCamera()}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, opacity: relockBusy ? 0.5 : 1 },
                        ]}>
                        <ThemedText type="smallBold">{relockBusy ? 'Locking…' : 'Re-lock'}</ThemedText>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={cameraBusy}
                        onPress={() => void flipCamera()}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, opacity: cameraBusy ? 0.5 : 1 },
                        ]}>
                        <ThemedText type="smallBold">Flip</ThemedText>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={stopCamera}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                        ]}>
                        <ThemedText type="smallBold">Stop camera</ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={cameraBusy}
                      onPress={() => void startCamera()}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: theme.accent, opacity: cameraBusy ? 0.45 : pressed ? 0.8 : 1 },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                        {cameraBusy ? 'Starting…' : 'Start camera'}
                      </ThemedText>
                    </Pressable>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { stopCamera(); autoStartedRef.current = false; setCameraError(null); pairing.reset(); setCodeInput(''); }}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                    ]}>
                    <ThemedText type="smallBold">End session</ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ConnChip({ label, connected, danger }: { label: string; connected: boolean; danger: boolean }) {
  const theme = useTheme();
  const color = danger ? theme.danger : connected ? theme.success : theme.textSecondary;
  return (
    <View style={[styles.chip, { borderColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

function cameraErrMsg(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Camera permission denied. Allow camera access for this site and try again.';
  }
  if (err instanceof Error) return err.message;
  return 'Could not start the camera.';
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
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  dot: { width: 6, height: 6, borderRadius: 3 },
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
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  videoBox: { height: 340, borderWidth: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#05070A' },
  lensBox: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  lensHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  lensRow: { gap: Spacing.two, paddingVertical: Spacing.half },
  lensChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  lensHint: { fontSize: 12, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
