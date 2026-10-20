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

  /** Let auto-exposure/focus/white-balance converge before locking. */
  autoAdjustForDocument(): Promise<void>;
  /** Best-effort on web; fully supported on native. */
  lockExposureFocusWhiteBalance(): Promise<void>;
  setTorch(enabled: boolean): Promise<void>;

  getStream(): MediaStream | null;
  onFrame(callback: (frame: VideoFrame) => void): () => void;

  /** Returns the actual resolution/fps/facingMode the browser granted. Null if no stream. */
  getActualSettings(): { width: number; height: number; fps: number; facingMode?: string } | null;

  /** Web-only: toggle front/rear camera. No-op on native. */
  flipCamera?(): Promise<void>;
}
