import { describe, expect, it } from 'vitest';

import {
  createImageLayer,
  createTextLayer,
  fillScaleFactor,
  fitScale,
  hitImage,
  layoutText,
  stageAspect,
  stageOutputSize,
  wrapText,
  zoomImageAt,
} from '@/lib/stage';

const phone = { w: 390, h: 844, dpr: 3 };

describe('stageAspect', () => {
  it('uses the Projector screen aspect by default', () => {
    expect(stageAspect(phone, 'projector', false)).toBeCloseTo(390 / 844);
  });

  it('turns the frame sideways when rotated', () => {
    expect(stageAspect(phone, 'projector', true)).toBeCloseTo(844 / 390);
  });

  it('orients preset shapes like the Projector', () => {
    expect(stageAspect(phone, '9:16', false)).toBeCloseTo(9 / 16);
    expect(stageAspect({ w: 844, h: 390, dpr: 3 }, '9:16', false)).toBeCloseTo(16 / 9);
    expect(stageAspect(phone, '1:1', true)).toBe(1);
  });
});

describe('stageOutputSize', () => {
  it('matches the physical long side of the Projector', () => {
    expect(stageOutputSize(phone, 390 / 844, 4096)).toEqual({ width: 1170, height: 2532 });
  });

  it('caps the long side', () => {
    expect(stageOutputSize(phone, 844 / 390, 2000)).toEqual({ width: 2000, height: 924 });
  });
});

describe('image fit', () => {
  it('fits a landscape image inside a portrait stage', () => {
    const layer = createImageLayer('x', 2000, 1000);
    expect(fitScale(layer, 400, 800)).toBeCloseTo(0.2);
  });

  it('swaps dimensions for a quarter turn', () => {
    const layer = { ...createImageLayer('x', 2000, 1000), rotation: 90 as const };
    expect(fitScale(layer, 400, 800)).toBeCloseTo(0.4);
  });

  it('computes the scale that fills the stage', () => {
    const layer = createImageLayer('x', 2000, 1000);
    // image 2:1 in a 1:2 stage: fit leaves bars, fill needs 4× the fit size.
    expect(fillScaleFactor(layer, 0.5)).toBeCloseTo(4);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length;

  it('wraps on word boundaries', () => {
    expect(wrapText('one two three four', 9, measure)).toEqual(['one two', 'three', 'four']);
  });

  it('keeps explicit newlines and blank lines', () => {
    expect(wrapText('a\n\nb', 10, measure)).toEqual(['a', '', 'b']);
  });

  it('keeps leading indentation for code', () => {
    expect(wrapText('  if x:', 20, measure)).toEqual(['  if x:']);
  });

  it('breaks words longer than a line', () => {
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('image editing', () => {
  // 400×200 image fitted into a 100×200 stage is drawn 100×50 at the centre.
  const layer = createImageLayer('x', 400, 200);

  it('hit-tests the drawn image only', () => {
    expect(hitImage(layer, 100, 200, 50, 100)).toBe(true);
    expect(hitImage(layer, 100, 200, 50, 130)).toBe(false);
  });

  it('hit-tests a quarter-turned image on its rotated footprint', () => {
    // Turned, it fills the stage at Fit; at half scale its footprint is 50 wide × 100 tall.
    const turned = { ...layer, rotation: 90 as const, scale: 0.5 };
    expect(hitImage(turned, 100, 200, 50, 140)).toBe(true);
    expect(hitImage(turned, 100, 200, 90, 100)).toBe(false);
  });

  it('zooms toward a point and keeps that point fixed', () => {
    const zoomed = zoomImageAt(layer, 2, 0.75, 0.5);
    expect(zoomed.scale).toBe(2);
    // The image point under x=0.75 stays under x=0.75.
    expect(zoomed.cx).toBeCloseTo(0.25);
    expect(zoomed.cy).toBeCloseTo(0.5);
  });

  it('keeps zoom inside the allowed range', () => {
    expect(zoomImageAt(layer, 100, 0.5, 0.5).scale).toBe(8);
  });
});

describe('layoutText', () => {
  it('reports the wrapped block size', () => {
    const layer = { ...createTextLayer('one two three'), x: 0, y: 0.5, size: 0.1 };
    const layout = layoutText(layer, 100, 200, (s) => s.length * 10);
    expect(layout.lines).toEqual(['one two', 'three']);
    expect(layout.top).toBe(100);
    expect(layout.width).toBe(70);
    expect(layout.height).toBeCloseTo(2 * 0.1 * 100 * 1.3);
  });
});
