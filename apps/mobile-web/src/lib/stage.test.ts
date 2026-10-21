import { describe, expect, it } from 'vitest';

import {
  createImageLayer,
  fillScaleFactor,
  fitScale,
  stageAspect,
  stageOutputSize,
  wrapText,
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
