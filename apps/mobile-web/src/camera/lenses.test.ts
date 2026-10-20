import { describe, expect, it } from 'vitest';

import { buildLensOptions, classifyCameraLens, isTextQualityResolution } from './lenses';
import type { CameraDevice } from './types';

function device(
  name: string,
  position: CameraDevice['position'] = 'back',
  id = name,
): CameraDevice {
  return { id, name, position };
}

describe('classifyCameraLens', () => {
  it('recognizes iPhone-style rear lenses', () => {
    expect(classifyCameraLens(device('Back Camera'))).toBe('wide');
    expect(classifyCameraLens(device('Back Ultra Wide Camera'))).toBe('ultrawide');
    expect(classifyCameraLens(device('Back Telephoto Camera'))).toBe('telephoto');
    expect(classifyCameraLens(device('Front Camera', 'front'))).toBe('front');
  });

  it('keeps generic Android camera names selectable', () => {
    expect(classifyCameraLens(device('camera2 0, facing back'))).toBe('unknown');
    expect(classifyCameraLens(device('camera2 1, facing front'))).toBe('front');
  });

  it('recognizes numeric wide-angle and telephoto labels', () => {
    expect(classifyCameraLens(device('0.5x Ultra Wide'))).toBe('ultrawide');
    expect(classifyCameraLens(device('2x telephoto'))).toBe('telephoto');
  });
});

describe('buildLensOptions', () => {
  it('excludes front cameras, orders ultra-wide first, and dedupes labels', () => {
    const options = buildLensOptions([
      device('Front Camera', 'front', 'f'),
      device('Back Camera', 'back', 'w'),
      device('Back Ultra Wide Camera', 'back', 'u'),
      device('Back Camera 2', 'back', 'w2'),
    ]);

    expect(options.map((option) => option.device.id)).toEqual(['u', 'w', 'w2']);
    expect(options.map((option) => option.label)).toEqual([
      'Ultra-wide',
      'Main · high quality',
      'Main · high quality (2)',
    ]);
  });

  it('keeps distinct generic Android camera labels', () => {
    const options = buildLensOptions([
      device('camera2 0, facing back', 'back', '0'),
      device('camera2 2, facing back', 'back', '2'),
    ]);

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.kind)).toEqual(['unknown', 'unknown']);
    expect(options.map((option) => option.device.id)).toEqual(['0', '2']);
    expect(options.map((option) => option.label)).toEqual(['Rear camera 0', 'Rear camera 2']);
  });

  it('turns numeric native camera names into readable labels', () => {
    const options = buildLensOptions([
      device('0', 'back', '0'),
      device('2', 'back', '2'),
    ]);

    expect(options.map((option) => option.label)).toEqual(['Rear camera 0', 'Rear camera 2']);
  });
});

describe('isTextQualityResolution', () => {
  it('accepts 1080p and 4K streams but rejects 720p', () => {
    expect(isTextQualityResolution(1920, 1080)).toBe(true);
    expect(isTextQualityResolution(2160, 3840)).toBe(true);
    expect(isTextQualityResolution(720, 1280)).toBe(false);
    expect(isTextQualityResolution(528, 960)).toBe(false);
    expect(isTextQualityResolution(0, 0)).toBe(false);
  });
});
