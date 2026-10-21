import { describe, expect, it } from 'vitest';

import {
  applyAutoLevels,
  applyClahe,
  applyLumaUnsharp,
  scoreSharpness,
  scoreSharpnessGrid,
} from '@/lib/image-quality';

function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = pixel(x, y);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

function boxBlur(source: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const si = (sy * width + sx) * 4;
          red += source[si];
          green += source[si + 1];
          blue += source[si + 2];
          count++;
        }
      }
      const i = (y * width + x) * 4;
      output[i] = red / count;
      output[i + 1] = green / count;
      output[i + 2] = blue / count;
      output[i + 3] = 255;
    }
  }
  return output;
}

function channelRange(data: Uint8ClampedArray): [number, number] {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  return [min, max];
}

describe('scoreSharpness', () => {
  it('scores a checkerboard higher than a blurred copy', () => {
    const width = 64;
    const height = 64;
    const sharp = makeImage(width, height, (x, y) => {
      return ((x >> 3) + (y >> 3)) % 2 === 0 ? 25 : 235;
    });
    const blurred = boxBlur(sharp, width, height);

    expect(scoreSharpness(sharp, width, height)).toBeGreaterThan(
      scoreSharpness(blurred, width, height),
    );
  });

  it('returns zero for a flat frame', () => {
    const data = makeImage(32, 32, () => 128);
    expect(scoreSharpness(data, 32, 32)).toBe(0);
  });
});

describe('applyAutoLevels', () => {
  it('stretches narrow input values across the full range', () => {
    const data = makeImage(16, 16, (x) => (x < 8 ? 100 : 140));
    applyAutoLevels(data, 16 * 16);

    expect(data[0]).toBe(0);
    expect(data[(15 * 16 + 15) * 4]).toBe(255);
    expect(data[3]).toBe(255);
  });
});

describe('applyClahe', () => {
  it('equalizes a low-contrast image without changing alpha', () => {
    const width = 64;
    const height = 64;
    const data = makeImage(width, height, (x) => 100 + Math.round((x / (width - 1)) * 40));
    const before = channelRange(data);
    applyClahe(data, width, height, { tiles: 1, clipLimit: 255, strength: 1 });
    const after = channelRange(data);

    expect(after[1] - after[0]).toBeGreaterThan(before[1] - before[0]);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('runs with production limits on a small tile grid', () => {
    const data = makeImage(64, 64, (x, y) => 100 + ((x + y) % 3) * 10);
    applyClahe(data, 64, 64, { tiles: 8, clipLimit: 2.2, strength: 0.55 });

    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });
});

describe('applyLumaUnsharp', () => {
  it('sharpens a gray edge while keeping the channels neutral', () => {
    const width = 64;
    const height = 16;
    const data = makeImage(width, height, (x) => (x < 32 ? 60 : 200));
    const sharpened = new Uint8ClampedArray(data);
    const blurred = boxBlur(data, width, height);

    const before = sharpened[(8 * width + 32) * 4] - sharpened[(8 * width + 31) * 4];
    applyLumaUnsharp(sharpened, blurred, 1.2);
    const after = sharpened[(8 * width + 32) * 4] - sharpened[(8 * width + 31) * 4];

    expect(after).toBeGreaterThan(before);
    for (let i = 0; i < sharpened.length; i += 4) {
      expect(sharpened[i]).toBe(sharpened[i + 1]);
      expect(sharpened[i + 1]).toBe(sharpened[i + 2]);
    }
  });
});

describe('scoreSharpnessGrid', () => {
  const width = 90;
  const height = 90;
  const texture = (x: number, y: number) => ((x >> 1) + (y >> 1)) % 2 === 0 ? 40 : 210;

  it('prefers a frame sharp everywhere over one sharp only at the bottom', () => {
    const everywhere = makeImage(width, height, texture);
    const bottomOnly = makeImage(width, height, texture);
    const soft = boxBlur(boxBlur(bottomOnly, width, height), width, height);
    // Top two thirds out of focus, bottom third sharp.
    bottomOnly.set(soft.subarray(0, width * 60 * 4), 0);
    expect(scoreSharpnessGrid(everywhere, width, height)).toBeGreaterThan(
      scoreSharpnessGrid(bottomOnly, width, height) * 2,
    );
  });

  it('scores a flat frame as zero', () => {
    expect(scoreSharpnessGrid(makeImage(width, height, () => 128), width, height)).toBe(0);
  });
});
