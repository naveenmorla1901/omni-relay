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

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        id: device.deviceId,
        name: device.label || `Camera ${index + 1}`,
        position: guessPosition(device.label),
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

    const video: MediaTrackConstraints = {
      width: { ideal: format.width },
      height: { ideal: format.height },
      frameRate: { ideal: format.fps, max: format.fps },
    };

    if (deviceId) {
      video.deviceId = { exact: deviceId };
    } else {
      video.facingMode = { ideal: 'environment' };
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }

    this.stream = null;
  }

  async lockExposureFocusWhiteBalance(): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) {
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [
          { exposureMode: 'manual' },
          { focusMode: 'manual' },
          { whiteBalanceMode: 'manual' },
        ],
      } as unknown as MediaTrackConstraints);
    } catch {
      // Safari and some Android browsers do not expose these controls.
    }
  }

  async setTorch(enabled: boolean): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) {
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled }],
      } as unknown as MediaTrackConstraints);
    } catch {
      // Torch control is best-effort on the web.
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  onFrame(): () => void {
    // CV frame processing is M5. The video track alone is enough for the feed.
    return () => undefined;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }
}

function guessPosition(label: string): CameraDevice['position'] {
  const normalized = label.toLowerCase();
  if (normalized.includes('back') || normalized.includes('rear') || normalized.includes('environment')) {
    return 'back';
  }
  if (normalized.includes('front') || normalized.includes('user') || normalized.includes('face')) {
    return 'front';
  }
  return 'external';
}

export function createCameraSource(): ICameraSource {
  return new WebCameraSource();
}
