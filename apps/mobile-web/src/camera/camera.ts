import { mediaDevices } from 'react-native-webrtc';

import { CONFIG } from '@/config';

import type { ICameraSource } from './ICameraSource';
import type { CameraDevice, CameraFormat } from './types';

class NativeCameraSource implements ICameraSource {
  private stream: any = null;
  private facingMode: 'user' | 'environment' = 'environment';

  async requestPermission(): Promise<boolean> {
    try {
      const s = await mediaDevices.getUserMedia({ video: true, audio: false });
      for (const t of (s as any).getTracks()) t.stop();
      return true;
    } catch {
      return false;
    }
  }

  async listDevices(): Promise<CameraDevice[]> {
    try {
      const devices = await mediaDevices.enumerateDevices() as any[];
      return devices
        .filter((d: any) => d.kind === 'videoinput')
        .map((d: any, i: number) => ({
          id: d.deviceId as string,
          name: (d.label as string) || `Camera ${i + 1}`,
          position:
            d.facing === 'front'
              ? 'front'
              : d.facing === 'environment'
                ? 'back'
                : guessPosition(d.label ?? ''),
        }));
    } catch {
      return [];
    }
  }

  async getFormats(_deviceId: string): Promise<CameraFormat[]> {
    return [
      { ...CONFIG.CAMERA_PREFERRED_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { ...CONFIG.CAPTURE_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { ...CONFIG.CAMERA_FALLBACK_RESOLUTION, fps: CONFIG.TARGET_FPS },
    ];
  }

  async start(deviceId: string, format: CameraFormat): Promise<void> {
    this.stop();
    const preferred = CONFIG.CAMERA_PREFERRED_RESOLUTION;
    const attempts: Record<string, unknown>[] = [
      {
        width: { ideal: preferred.width },
        height: { ideal: preferred.height },
        frameRate: { ideal: format.fps, max: format.fps },
      },
      {
        width: { ideal: format.width },
        height: { ideal: format.height },
        frameRate: { ideal: format.fps, max: format.fps },
      },
      {
        width: { ideal: CONFIG.CAMERA_FALLBACK_RESOLUTION.width },
        height: { ideal: CONFIG.CAMERA_FALLBACK_RESOLUTION.height },
        frameRate: { ideal: format.fps, max: format.fps },
      },
    ];

    let lastError: unknown;
    for (const video of attempts) {
      if (deviceId) {
        video.deviceId = deviceId;
      } else {
        video.facingMode = { ideal: this.facingMode };
      }
      try {
        this.stream = await mediaDevices.getUserMedia({ audio: false, video });
        this.markTrackForDetail();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('Could not start the camera.');
  }

  stop(): void {
    if (this.stream) {
      for (const t of (this.stream as any).getTracks()) t.stop();
      this.stream = null;
    }
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
    } catch { /* best-effort */ }
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
    } catch { /* best-effort */ }
  }

  async setTorch(enabled: boolean): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
    } catch { /* best-effort */ }
  }

  setFacingMode(mode: 'user' | 'environment'): void {
    this.facingMode = mode;
  }

  async flipCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.stream) {
      const format: CameraFormat = {
        ...CONFIG.CAPTURE_RESOLUTION,
        fps: CONFIG.TARGET_FPS,
      };
      await this.start('', format);
    }
  }

  getStream(): globalThis.MediaStream | null {
    return this.stream as globalThis.MediaStream | null;
  }

  getActualSettings(): {
    width: number;
    height: number;
    fps: number;
    facingMode?: string;
    deviceId?: string;
  } | null {
    const track = this.getVideoTrack();
    if (!track) return null;
    const s = track.getSettings() as MediaTrackSettings & { deviceId?: string };
    return {
      width: s.width ?? 0,
      height: s.height ?? 0,
      fps: Math.round((s.frameRate ?? 0) * 10) / 10,
      facingMode: s.facingMode ?? this.facingMode,
      deviceId: s.deviceId,
    };
  }

  onFrame(): () => void {
    return () => undefined;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    return ((this.stream as any)?.getVideoTracks()[0] ?? null) as MediaStreamTrack | null;
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
  return new NativeCameraSource();
}
