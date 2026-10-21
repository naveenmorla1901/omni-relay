import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

/** Native side lives in `modules/recorder-service` (Android only). */
type RecorderServiceModule = {
  start(title: string, text: string): boolean;
  stop(): void;
  isRunning(): boolean;
};

const service = Platform.OS === 'android'
  ? requireOptionalNativeModule<RecorderServiceModule>('RecorderService')
  : null;

/** Whether this build can keep the camera streaming with the screen off. */
export const backgroundCameraSupported = service !== null;

/**
 * Start the camera foreground service so Android keeps camera access while
 * the screen is off. Call while the Recorder is visible and streaming.
 */
export async function startBackgroundCamera(): Promise<boolean> {
  if (!service) return false;
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    // Without this the service still runs; only its notification is hidden.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
  }
  try {
    return service.start('ClearRelay Recorder', 'Camera is streaming to Admin. Tap to open.');
  } catch {
    return false;
  }
}

export function stopBackgroundCamera(): void {
  try {
    service?.stop();
  } catch {
    // Already stopped.
  }
}

export function isBackgroundCameraRunning(): boolean {
  try {
    return service?.isRunning() ?? false;
  } catch {
    return false;
  }
}
