import type { CameraDevice } from './types';

/**
 * Physical lens groups exposed by a phone or browser. Most devices publish
 * separate camera devices for ultra-wide / main / telephoto; Android may merge
 * them into one logical camera, in which case only the default remains.
 */
export type CameraLensKind = 'ultrawide' | 'wide' | 'telephoto' | 'front' | 'unknown';

export type CameraLensOption = {
  device: CameraDevice;
  kind: CameraLensKind;
  label: string;
};

const ULTRA_WIDE_RE = /(ultra[\s-]?wide|ultrawide|wide[\s-]?angle|0[.,]5\s*x|\buw\b)/i;
const TELEPHOTO_RE = /(tele[\s-]?photo|telephoto|periscope|\b[2-9](?:\.\d+)?\s*x\b)/i;
const FRONT_RE = /(front|selfie|\buser\b|\bface)/i;
const WIDE_RE = /(\bwide\b|\bmain\b|back\s+camera|rear\s+camera)/i;

const LENS_PRIORITY: Record<CameraLensKind, number> = {
  ultrawide: 0,
  wide: 1,
  telephoto: 2,
  unknown: 3,
  front: 4,
};

/** Classify a device from the labels Chrome/Safari/react-native-webrtc expose. */
export function classifyCameraLens(device: CameraDevice): CameraLensKind {
  const label = device.name;
  if (device.position === 'front' || FRONT_RE.test(label)) return 'front';
  if (ULTRA_WIDE_RE.test(label)) return 'ultrawide';
  if (TELEPHOTO_RE.test(label)) return 'telephoto';
  if (WIDE_RE.test(label)) return 'wide';
  return 'unknown';
}

export function lensKindLabel(kind: CameraLensKind): string {
  switch (kind) {
    case 'ultrawide':
      return 'Ultra-wide';
    case 'wide':
      return 'Main · high quality';
    case 'telephoto':
      return 'Telephoto';
    case 'front':
      return 'Front';
    default:
      return 'Rear camera';
  }
}

/** Human label for a lens, using the platform name when it is not classifiable. */
export function lensDisplayLabel(device: CameraDevice): string {
  const kind = classifyCameraLens(device);
  if (kind !== 'unknown') return lensKindLabel(kind);

  const name = device.name.trim();
  if (!name) return 'Rear camera';
  const camera2 = name.match(/camera2\s+(\d+)/i);
  if (camera2) return `Rear camera ${camera2[1]}`;
  const cameraN = name.match(/^camera\s+(\d+)$/i);
  if (cameraN) return `Rear camera ${cameraN[1]}`;
  if (/^\d+$/.test(name)) return `Rear camera ${name}`;
  return name;
}

/**
 * Build selectable rear-lens options.
 *
 * - Front cameras are excluded; the existing Flip control handles those.
 * - Ultra-wide sorts first so the close-up lens is easy to find.
 * - Generic Android names ("camera2 0, facing back") stay visible; the user
 *   can try each physical camera when the OS does not expose lens names.
 */
export function buildLensOptions(devices: CameraDevice[]): CameraLensOption[] {
  const options = devices
    .filter((device) => device.position !== 'front')
    .map((device) => ({
      device,
      kind: classifyCameraLens(device),
      label: lensDisplayLabel(device),
    }))
    .filter((option) => option.kind !== 'front')
    .sort((a, b) => LENS_PRIORITY[a.kind] - LENS_PRIORITY[b.kind] || a.label.localeCompare(b.label));

  const counts = new Map<string, number>();
  return options.map((option) => {
    const count = (counts.get(option.label) ?? 0) + 1;
    counts.set(option.label, count);
    return count === 1 ? option : { ...option, label: `${option.label} (${count})` };
  });
}
