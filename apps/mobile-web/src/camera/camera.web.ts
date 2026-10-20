import { CONFIG } from '@/config';

import type { ICameraSource } from './ICameraSource';
import type { CameraDevice, CameraFormat } from './types';

class WebCameraSource implements ICameraSource {
  private stream: MediaStream | null = null;

  async requestPermission(): Promise<boolean> {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  async listDevices(): Promise<CameraDevice[]> {
    if (!globalThis.navigator?.mediaDevices?.enumerateDevices) {
      return [];
    }

    // A short getUserMedia call is required before enumerateDevices returns labels.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      for (const t of probe.getTracks()) t.stop();
    } catch {
      // If permission is already granted, labels are available without this probe.
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        id: d.deviceId,
        name: d.label || `Camera ${i + 1}`,
        position: guessPosition(d.label),
      }));
  }

  async getFormats(_deviceId: string): Promise<CameraFormat[]> {
    return [
      { ...CONFIG.CAPTURE_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { width: 1280, height: 720, fps: CONFIG.TARGET_FPS },
      { width: 640, height: 480, fps: CONFIG.TARGET_FPS },
    ];
  }

  async start(deviceId: string, format: CameraFormat): Promise<void> {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose a camera. Use HTTPS and allow camera access.');
    }

    this.stop();

    // Try progressively relaxed constraints so we always get a stream.
    // Attempt 1: preferred rear camera + HD minimum floor
    // Attempt 2: drop the min floor (some browsers reject it even when they support HD)
    // Attempt 3: bare fallback (any camera, any resolution)
    const attempts: MediaTrackConstraints[] = [
      {
        width: { min: 1280, ideal: format.width },
        height: { min: 720, ideal: format.height },
        frameRate: { ideal: format.fps, max: format.fps },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      },
      {
        width: { ideal: format.width },
        height: { ideal: format.height },
        frameRate: { ideal: format.fps, max: format.fps },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      },
      {
        facingMode: { ideal: 'environment' },
      },
    ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
        // Tell the WebRTC encoder to prioritise detail/sharpness over motion smoothness.
        const vt = this.stream.getVideoTracks()[0];
        if (vt && 'contentHint' in vt) (vt as MediaStreamTrack & { contentHint: string }).contentHint = 'detail';
        return;
      } catch (err) {
        lastError = err;
        const name = err instanceof DOMException ? err.name : '';
        // Only retry on constraint / device errors, not permission errors.
        if (name !== 'OverconstrainedError' && name !== 'NotFoundError' && name !== 'NotReadableError') {
          throw err;
        }
      }
    }

    throw lastError;
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }

    this.stream = null;
  }

  async lockExposureFocusWhiteBalance(): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [
          { exposureMode: 'manual' } as MediaTrackConstraintSet,
          { focusMode: 'manual' } as MediaTrackConstraintSet,
          { whiteBalanceMode: 'manual' } as MediaTrackConstraintSet,
        ],
      });
    } catch {
      // Safari and many Android browsers do not expose these controls.
    }
  }

  async setTorch(enabled: boolean): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      });
    } catch {
      // Best-effort on the web.
    }
  }

  /** Try to switch between front and rear camera while keeping the stream running. */
  async flipCamera(): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    const current = track.getSettings().facingMode;
    const next = current === 'environment' ? 'user' : 'environment';

    try {
      await track.applyConstraints({ facingMode: { exact: next } });
    } catch {
      // Some browsers require a full restart to switch cameras.
      const format: CameraFormat = {
        width: track.getSettings().width ?? CONFIG.CAPTURE_RESOLUTION.width,
        height: track.getSettings().height ?? CONFIG.CAPTURE_RESOLUTION.height,
        fps: CONFIG.TARGET_FPS,
      };
      const overrides: MediaTrackConstraints = {
        width: { ideal: format.width },
        height: { ideal: format.height },
        frameRate: { ideal: format.fps, max: format.fps },
        facingMode: { ideal: next },
      };
      this.stop();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: overrides });
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getActualSettings(): { width: number; height: number; fps: number; facingMode?: string } | null {
    const track = this.getVideoTrack();
    if (!track) return null;
    const s = track.getSettings();
    return {
      width: s.width ?? 0,
      height: s.height ?? 0,
      fps: Math.round((s.frameRate ?? 0) * 10) / 10,
      facingMode: s.facingMode,
    };
  }

  onFrame(): () => void {
    // CV frame processing is M5; video track alone drives the feed for now.
    return () => undefined;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }
}

function guessPosition(label: string): CameraDevice['position'] {
  const l = label.toLowerCase();
  if (l.includes('back') || l.includes('rear') || l.includes('environment')) return 'back';
  if (l.includes('front') || l.includes('user') || l.includes('face')) return 'front';
  return 'external';
}

export function createCameraSource(): ICameraSource {
  return new WebCameraSource();
}
