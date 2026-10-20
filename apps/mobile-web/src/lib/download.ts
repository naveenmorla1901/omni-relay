import { Alert } from 'react-native';

/**
 * Native fallback. Admin capture is web-only today (it uses HTMLVideoElement +
 * canvas), so keep the same import surface and point the user at the web app.
 */
export function downloadCapture(_dataUrl: string, _filename?: string): void {
  Alert.alert('Download', 'Open the web Admin to download captures.');
}
