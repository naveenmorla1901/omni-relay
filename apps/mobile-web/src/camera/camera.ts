import type { ICameraSource } from './ICameraSource';

/** Native Vision Camera integration is tracked for the native build phase. */
export function createCameraSource(): ICameraSource {
  throw new Error('Native camera capture is not implemented yet. Use the web build for the live feed.');
}
