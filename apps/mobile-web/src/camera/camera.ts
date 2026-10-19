/* eslint-disable @typescript-eslint/no-explicit-any */
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
          position: guessPosition(d.label ?? ''),
        }));
    } catch {
      return [];
    }
  }

  async getFormats(_deviceId: string): Promise<CameraFormat[]> {
    return [
      { ...CONFIG.CAPTURE_RESOLUTION, fps: CONFIG.TARGET_FPS },
      { width: 1280, height: 720, fps: CONFIG.TARGET_FPS },
      { width: 640, height: 480, fps: CONFIG.TARGET_FPS },
    ];
  }

  async start(deviceId: string, format: CameraFormat): Promise<void> {
    this.stop();
    const video: Record<string, unknown> = {
      width: { ideal: format.width },
      height: { ideal: format.height },
      frameRate: { ideal: format.fps, max: format.fps },
    };
    if (deviceId) {
      video.deviceId = deviceId;
    } else {
      video.facingMode = { ideal: this.facingMode };
    }
    this.stream = await mediaDevices.getUserMedia({ audio: false, video });
  }

  stop(): void {
    if (this.stream) {
      for (const t of (this.stream as any).getTracks()) t.stop();
      this.stream = null;
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

  async flipCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.stream) {
      const format: CameraFormat = {
        width: CONFIG.CAPTURE_RESOLUTION.width,
        height: CONFIG.CAPTURE_RESOLUTION.height,
        fps: CONFIG.TARGET_FPS,
      };
      await this.start('', format);
    }
  }

  getStream(): globalThis.MediaStream | null {
    return this.stream as globalThis.MediaStream | null;
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
    return () => undefined;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    return ((this.stream as any)?.getVideoTracks()[0] ?? null) as MediaStreamTrack | null;
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
