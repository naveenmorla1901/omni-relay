import { CONFIG } from '@/config';

import type { ICameraSource } from './ICameraSource';
import type { CameraDevice, CameraFormat } from './types';

class WebCameraSource implements ICameraSource {
  private stream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'environment';

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
      { ...CONFIG.CAMERA_PREFERRED_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { ...CONFIG.CAPTURE_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { ...CONFIG.CAMERA_FALLBACK_RESOLUTION, fps: CONFIG.TARGET_FPS },
    ];
  }

  async start(deviceId: string, format: CameraFormat): Promise<void> {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose a camera. Use HTTPS and allow camera access.');
    }

    this.stop();

    // Try progressively relaxed constraints. The first request preserves the
    // resolution floor; later requests trade only resolution for compatibility.
    const preferred = CONFIG.CAMERA_PREFERRED_RESOLUTION;
    const minimum = CONFIG.CAMERA_MIN_RESOLUTION;
    const attempts: MediaTrackConstraints[] = [
      {
        width: { min: minimum.width, ideal: preferred.width },
        height: { min: minimum.height, ideal: preferred.height },
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
        width: { ideal: CONFIG.CAMERA_FALLBACK_RESOLUTION.width },
        height: { ideal: CONFIG.CAMERA_FALLBACK_RESOLUTION.height },
        frameRate: { ideal: format.fps, max: format.fps },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      },
    ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
        this.markTrackForDetail();
        const actualFacing = this.getVideoTrack()?.getSettings().facingMode;
        this.facingMode = actualFacing === 'user' ? 'user' : 'environment';
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

  async autoAdjustForDocument(): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [
          { exposureMode: 'continuous' } as MediaTrackConstraintSet,
          { focusMode: 'continuous' } as MediaTrackConstraintSet,
          { whiteBalanceMode: 'continuous' } as MediaTrackConstraintSet,
        ],
      });
    } catch {
      // Safari and many Android browsers do not expose these controls.
    }
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
    this.facingMode = next;

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
      this.markTrackForDetail();
    }

    const actualFacing = this.getVideoTrack()?.getSettings().facingMode;
    if (actualFacing === 'user' || actualFacing === 'environment') {
      this.facingMode = actualFacing;
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
      facingMode: s.facingMode ?? this.facingMode,
    };
  }

  onFrame(): () => void {
    // CV frame processing is M5; video track alone drives the feed for now.
    return () => undefined;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  private markTrackForDetail(): void {
    const track = this.getVideoTrack();
    if (track && 'contentHint' in track) {
      (track as MediaStreamTrack & { contentHint: string }).contentHint = 'detail';
    }
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
