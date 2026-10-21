import { describe, expect, it } from 'vitest';

import { detectQuad, warpPixels } from '@/lib/quad';

type P = [number, number];

function inside(x: number, y: number, poly: P[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function makeImage(w: number, h: number, poly: P[]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 45;
    data[i + 1] = 45;
    data[i + 2] = 45;
    data[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y, poly)) continue;
      const i = (y * w + x) * 4;
      data[i] = 235;
      data[i + 1] = 235;
      data[i + 2] = 235;
    }
  }
  return { data, width: w, height: h } as ImageData;
}

function expectNear(actual: [number, number], expected: P, tolerance = 15): void {
  expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1])).toBeLessThan(tolerance);
}

describe('detectQuad', () => {
  it('finds an axis-aligned screen', () => {
    const expected: P[] = [[80, 60], [560, 60], [560, 420], [80, 420]];
    const corners = detectQuad(makeImage(640, 480, expected));
    expect(corners).not.toBeNull();
    if (!corners) return;
    corners.forEach((corner, i) => expectNear(corner, expected[i]));
  });

  it('finds a perspective-distorted screen', () => {
    const expected: P[] = [[120, 70], [540, 110], [500, 420], [80, 360]];
    const corners = detectQuad(makeImage(640, 480, expected));
    expect(corners).not.toBeNull();
    if (!corners) return;
    corners.forEach((corner, i) => expectNear(corner, expected[i]));
  });

  it('returns null for a flat image', () => {
    const data = new Uint8ClampedArray(320 * 240 * 4).fill(128);
    expect(detectQuad({ data, width: 320, height: 240 } as ImageData)).toBeNull();
  });
});

describe('warpPixels', () => {
  const w = 64;
  const h = 48;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const v = (p % w) < w / 2 ? 20 : 230;
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = v;
    data[p * 4 + 3] = 255;
  }
  const src = { data, width: w, height: h };

  it('reproduces the source exactly for an axis-aligned quad', () => {
    const out = warpPixels(src, [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])!;
    expect(out.width).toBe(w - 1);
    for (let x = 0; x < out.width; x++) expect(out.data[(10 * out.width + x) * 4]).toBe(data[(10 * w + x) * 4]);
  });

  it('keeps a step edge steep under a half-pixel shift (bicubic, not bilinear)', () => {
    const out = warpPixels(src, [[0.5, 0], [w - 1.5, 0], [w - 1.5, h - 1], [0.5, h - 1]])!;
    let steepest = 0;
    for (let x = 1; x < out.width; x++) {
      const i = (10 * out.width + x) * 4;
      steepest = Math.max(steepest, Math.abs(out.data[i] - out.data[i - 4]));
    }
    // Bilinear splits the 210-level step into two ~105 steps; Catmull-Rom keeps ~117+.
    expect(steepest).toBeGreaterThan(112);
  });

  it('returns null for a degenerate quad', () => {
    expect(warpPixels(src, [[0, 0], [3, 0], [3, 3], [0, 3]])).toBeNull();
  });
});
