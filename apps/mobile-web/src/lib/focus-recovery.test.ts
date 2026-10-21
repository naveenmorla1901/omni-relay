import { describe, expect, it } from 'vitest';

import { applyFocusRecovery, defocusMap, softEdgeReport } from '@/lib/focus-recovery';

const W = 192;
const H = 128;

/** Text-like texture: dark glyph blocks on a light screen. */
function glyphs(x: number, y: number): number {
  return (Math.floor(x / 3) + Math.floor(y / 5)) % 3 === 0 && y % 16 < 11 ? 30 : 220;
}

function makeImage(pixel: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = pixel(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Box-blur rows above `untilY` `passes` times: the far, out-of-focus edge of a tilted screen. */
function defocusTop(data: Uint8ClampedArray, untilY: number, passes = 3): void {
  for (let pass = 0; pass < passes; pass++) {
    const copy = data.slice();
    for (let y = 1; y < Math.min(untilY, H - 1); y++) {
      for (let x = 1; x < W - 1; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += copy[((y + dy) * W + x + dx) * 4];
        }
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = sum / 9;
      }
    }
  }
}

function luma(data: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let p = 0; p < out.length; p++) out[p] = data[p * 4];
  return out;
}

/** Mean |horizontal gradient| in a row band — higher means steeper glyph edges. */
function edgeEnergy(data: Uint8ClampedArray, y0: number, y1: number): number {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 1; x < W; x++) {
      sum += Math.abs(data[(y * W + x) * 4] - data[(y * W + x - 1) * 4]);
      count++;
    }
  }
  return sum / count;
}

describe('defocusMap', () => {
  it('marks the blurred top tiles and not the sharp bottom ones', () => {
    const data = makeImage(glyphs);
    defocusTop(data, H / 2);
    const map = defocusMap(luma(data), W, H, 4, 4);
    const top = (map[0] + map[1] + map[2] + map[3]) / 4;
    const bottom = (map[12] + map[13] + map[14] + map[15]) / 4;
    expect(top).toBeGreaterThan(0.2);
    expect(bottom).toBeLessThan(0.05);
  });

  it('ignores flat tiles', () => {
    const map = defocusMap(new Uint8Array(W * H).fill(128), W, H, 4, 4);
    expect(Array.from(map).every((v) => v === 0)).toBe(true);
  });
});

describe('softEdgeReport', () => {
  it('names the side that is softer than its opposite', () => {
    const grid = new Float32Array([0.6, 0.6, 0.6, 0.6, 0.3, 0.3, 0.3, 0.3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(softEdgeReport(grid, 4, 4, 0.2).softEdge).toBe('top');
    expect(softEdgeReport(new Float32Array(16).fill(0.4), 4, 4, 0.2).softEdge).toBeNull();
  });
});

describe('applyFocusRecovery', () => {
  it('restores more edge contrast where the frame is defocused and reports that edge', () => {
    const data = makeImage(glyphs);
    defocusTop(data, H / 2);
    const before = data.slice();
    const report = applyFocusRecovery(data, W, H, { tilesX: 4, tilesY: 4, chromaSigma: 0 });

    const topGain = edgeEnergy(data, 8, H / 2 - 8) / edgeEnergy(before, 8, H / 2 - 8);
    const bottomGain = edgeEnergy(data, H / 2 + 8, H - 8) / edgeEnergy(before, H / 2 + 8, H - 8);
    expect(topGain).toBeGreaterThan(1.15);
    expect(topGain).toBeGreaterThan(bottomGain);
    expect(report.softEdge).toBe('top');
  });

  it('never overshoots the local range by more than the margin (no halos)', () => {
    const data = makeImage((x) => (x < W / 2 ? 40 : 200));
    defocusTop(data, H);
    applyFocusRecovery(data, W, H, { overshoot: 3, chromaSigma: 0, fineAmount: 2, coarseAmount: 3 });
    for (let p = 0; p < W * H; p++) {
      expect(data[p * 4]).toBeGreaterThanOrEqual(37);
      expect(data[p * 4]).toBeLessThanOrEqual(203);
    }
  });

  it('removes colour moiré but keeps brightness', () => {
    // Alternating red/cyan columns of nearly equal luma: pure chroma moiré.
    const data = new Uint8ClampedArray(W * H * 4);
    for (let p = 0; p < W * H; p++) {
      const red = (p % W) % 2 === 0;
      data[p * 4] = red ? 200 : 60;
      data[p * 4 + 1] = red ? 90 : 150;
      data[p * 4 + 2] = red ? 90 : 150;
      data[p * 4 + 3] = 255;
    }
    const lumaBefore = 0.299 * 200 + 0.587 * 90 + 0.114 * 90;
    applyFocusRecovery(data, W, H, { fineAmount: 0, coarseAmount: 0 });
    const mid = ((H / 2) * W + W / 2) * 4;
    expect(Math.abs(data[mid] - data[mid + 4])).toBeLessThan(30);
    const lumaAfter = 0.299 * data[mid] + 0.587 * data[mid + 1] + 0.114 * data[mid + 2];
    expect(Math.abs(lumaAfter - lumaBefore)).toBeLessThan(8);
  });

  it('leaves a flat frame unchanged', () => {
    const data = makeImage(() => 128);
    const report = applyFocusRecovery(data, W, H);
    expect(Array.from(data.subarray(0, 64)).every((v, i) => (i % 4 === 3 ? v === 255 : v === 128))).toBe(true);
    expect(report.softEdge).toBeNull();
  });
});
