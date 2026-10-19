import type { CameraDevice, CameraFormat } from '@/camera/types';

/**
 * Platform-neutral camera boundary (ClearRelay-Build-Plan.md §2.3).
 * Native uses Vision Camera; web uses getUserMedia. Shared code depends only on this.
 */
export interface ICameraSource {
  requestPermission(): Promise<boolean>;
  listDevices(): Promise<CameraDevice[]>;
  getFormats(deviceId: string): Promise<CameraFormat[]>;
  start(deviceId: string, format: CameraFormat): Promise<void>;
  stop(): void;

  /** Best-effort on web; fully supported on native. */
  lockExposureFocusWhiteBalance(): Promise<void>;
  setTorch(enabled: boolean): Promise<void>;

  getStream(): MediaStream | null;
  onFrame(callback: (frame: VideoFrame) => void): () => void;
}
