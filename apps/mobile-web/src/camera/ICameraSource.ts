import type { CameraDevice, CameraFormat } from '@/camera/types';

/**
 * Platform-neutral camera boundary (ClearRelay-Build-Plan.md §2.3).
 * Native uses react-native-webrtc; web uses getUserMedia. Shared code depends only on this.
 */
export interface ICameraSource {
  requestPermission(): Promise<boolean>;
  listDevices(): Promise<CameraDevice[]>;
  getFormats(deviceId: string): Promise<CameraFormat[]>;
  start(deviceId: string, format: CameraFormat): Promise<void>;
  stop(): void;

  /** Restore continuous auto-exposure/focus/white-balance. */
  autoAdjustForDocument(): Promise<void>;
  /**
   * Freeze white balance only. Focus and exposure stay continuous: a locked
   * focus blurs as soon as the handheld phone moves. Best-effort on web; no-op
   * on native (react-native-webrtc has no focus/exposure/WB controls).
   */
  lockWhiteBalance(): Promise<void>;
  /** Best-effort on web; no-op on native. */
  setTorch(enabled: boolean): Promise<void>;

  /** Set the desired facing for the Auto camera selection. */
  setFacingMode(mode: 'user' | 'environment'): void;

  getStream(): MediaStream | null;
  onFrame(callback: (frame: VideoFrame) => void): () => void;

  /** Returns the actual resolution/fps/facingMode/deviceId the browser granted. Null if no stream. */
  getActualSettings(): {
    width: number;
    height: number;
    fps: number;
    facingMode?: string;
    deviceId?: string;
  } | null;

  /** Web-only: toggle front/rear camera. No-op on native. */
  flipCamera?(): Promise<void>;
}
