/** Browsers stop the camera when the screen turns off; only the Android app can keep it. */
export const backgroundCameraSupported = false;

export async function startBackgroundCamera(): Promise<boolean> {
  return false;
}

export function stopBackgroundCamera(): void {}

export function isBackgroundCameraRunning(): boolean {
  return false;
}
