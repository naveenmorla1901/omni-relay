/**
 * Pure pixel-quality helpers used by the web capture pipeline.
 * Keep this module DOM-free so Vitest can exercise it in Node.
 */

export type ClaheOptions = {
  tiles?: number;
  clipLimit?: number;
  strength?: number;
};

/**
 * Laplacian-variance sharpness score. The caller normally supplies a small
 * thumbnail, so the grid is sampled rather than walking every 4K pixel.
 * Higher is sharper; a flat image scores 0.
 */
export function scoreSharpness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3 || data.length < width * height * 4) return 0;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 360));
  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const left = (i - step * 4) | 0;
      const right = (i + step * 4) | 0;
      const up = i - step * width * 4;
      const down = i + step * width * 4;

      const l = luma(data[i], data[i + 1], data[i + 2]);
      const laplacian =
        4 * l -
        luma(data[left], data[left + 1], data[left + 2]) -
        luma(data[right], data[right + 1], data[right + 2]) -
        luma(data[up], data[up + 1], data[up + 2]) -
        luma(data[down], data[down + 1], data[down + 2]);

      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSquares / count - mean * mean);
}

/**
 * Frame score that rewards being sharp everywhere: the geometric mean of the
 * Laplacian variance of a 3×3 grid. Picking frames by a whole-frame score
 * favours the in-focus bottom of a tilted screen; this also weighs the top.
 */
export function scoreSharpnessGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cells = 3,
): number {
  if (width < cells * 3 || height < cells * 3 || data.length < width * height * 4) return 0;
  let logSum = 0;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const x0 = Math.floor((cx * width) / cells);
      const y0 = Math.floor((cy * height) / cells);
      const w = Math.floor(((cx + 1) * width) / cells) - x0;
      const h = Math.floor(((cy + 1) * height) / cells) - y0;
      const cell = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        const from = ((y0 + row) * width + x0) * 4;
        cell.set(data.subarray(from, from + w * 4), row * w * 4);
      }
      logSum += Math.log(1 + scoreSharpness(cell, w, h));
    }
  }
  return Math.exp(logSum / (cells * cells)) - 1;
}

/** Stretch each channel between its 0.5% tails, matching the previous pipeline. */
export function applyAutoLevels(data: Uint8ClampedArray, pixelCount: number): void {
  if (!pixelCount) return;

  const rHistogram = new Uint32Array(256);
  const gHistogram = new Uint32Array(256);
  const bHistogram = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    rHistogram[data[i]]++;
    gHistogram[data[i + 1]]++;
    bHistogram[data[i + 2]]++;
  }

  const clip = Math.max(1, Math.round(pixelCount * 0.005));
  const rLow = findClip(rHistogram, clip, false);
  const rHigh = findClip(rHistogram, clip, true);
  const gLow = findClip(gHistogram, clip, false);
  const gHigh = findClip(gHistogram, clip, true);
  const bLow = findClip(bHistogram, clip, false);
  const bHigh = findClip(bHistogram, clip, true);

  const rRange = rHigh - rLow || 1;
  const gRange = gHigh - gLow || 1;
  const bRange = bHigh - bLow || 1;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte(((data[i] - rLow) / rRange) * 255);
    data[i + 1] = clampByte(((data[i + 1] - gLow) / gRange) * 255);
    data[i + 2] = clampByte(((data[i + 2] - bLow) / bRange) * 255);
  }
}

/**
 * Sharpens luminance only and adds the same delta to RGB. This keeps white
 * text neutral instead of producing red/blue fringes around screen glyphs.
 */
export function applyLumaUnsharp(
  data: Uint8ClampedArray,
  blurred: Uint8ClampedArray,
  amount: number,
  threshold = 0,
): void {
  if (data.length !== blurred.length) return;

  for (let i = 0; i < data.length; i += 4) {
    const originalLuma = luma(data[i], data[i + 1], data[i + 2]);
    const blurredLuma = luma(blurred[i], blurred[i + 1], blurred[i + 2]);
    const difference = originalLuma - blurredLuma;
    if (Math.abs(difference) < threshold) continue;

    const delta = difference * amount;
    data[i] = clampByte(data[i] + delta);
    data[i + 1] = clampByte(data[i + 1] + delta);
    data[i + 2] = clampByte(data[i + 2] + delta);
  }
}

/**
 * Contrast-limited adaptive histogram equalization on luminance, blended
 * with the original to avoid the crunchy look of full equalization.
 * Tile LUTs are bilinearly interpolated so dark screens gain local contrast
 * without visible tile seams.
 */
export function applyClahe(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ClaheOptions = {},
): void {
  if (width < 2 || height < 2 || data.length < width * height * 4) return;

  const maxTiles = Math.max(1, Math.floor(Math.min(width, height) / 32));
  const tiles = clampInt(Math.min(options.tiles ?? 8, maxTiles), 1, 16);
  const clipLimit = Math.max(1, options.clipLimit ?? 2.2);
  const strength = Math.min(1, Math.max(0, options.strength ?? 0.55));
  const tileWidth = Math.ceil(width / tiles);
  const tileHeight = Math.ceil(height / tiles);
  const luts: Uint8Array[] = [];
  const histogram = new Uint32Array(256);

  for (let tileY = 0; tileY < tiles; tileY++) {
    const yStart = tileY * tileHeight;
    const yEnd = Math.min(height, yStart + tileHeight);

    for (let tileX = 0; tileX < tiles; tileX++) {
      const xStart = tileX * tileWidth;
      const xEnd = Math.min(width, xStart + tileWidth);
      histogram.fill(0);
      let count = 0;

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          histogram[Math.round(luma(data[i], data[i + 1], data[i + 2]))]++;
          count++;
        }
      }

      if (count === 0) {
        const identity = new Uint8Array(256);
        for (let i = 0; i < 256; i++) identity[i] = i;
        luts.push(identity);
        continue;
      }

      const limit = Math.max(1, Math.round((count / 256) * clipLimit));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (histogram[i] > limit) {
          excess += histogram[i] - limit;
          histogram[i] = limit;
        }
      }

      const perBin = Math.floor(excess / 256);
      let remainder = excess - perBin * 256;
      for (let i = 0; i < 256; i++) {
        histogram[i] += perBin;
        if (remainder > 0) {
          histogram[i]++;
          remainder--;
        }
      }

      const lut = new Uint8Array(256);
      let cumulative = 0;
      for (let i = 0; i < 256; i++) {
        cumulative += histogram[i];
        lut[i] = clampByte((cumulative / count) * 255);
      }
      luts.push(lut);
    }
  }

  for (let y = 0; y < height; y++) {
    const tileY = y / tileHeight - 0.5;
    const tileY0 = Math.floor(tileY);
    const weightY = tileY - tileY0;
    const top = clampInt(tileY0, 0, tiles - 1);
    const bottom = clampInt(tileY0 + 1, 0, tiles - 1);

    for (let x = 0; x < width; x++) {
      const tileX = x / tileWidth - 0.5;
      const tileX0 = Math.floor(tileX);
      const weightX = tileX - tileX0;
      const left = clampInt(tileX0, 0, tiles - 1);
      const right = clampInt(tileX0 + 1, 0, tiles - 1);
      const i = (y * width + x) * 4;
      const l = luma(data[i], data[i + 1], data[i + 2]);
      const lIndex = Math.round(l);

      const topLut = luts[top * tiles + left];
      const topRightLut = luts[top * tiles + right];
      const bottomLut = luts[bottom * tiles + left];
      const bottomRightLut = luts[bottom * tiles + right];
      const topValue = topLut[lIndex] * (1 - weightX) + topRightLut[lIndex] * weightX;
      const bottomValue =
        bottomLut[lIndex] * (1 - weightX) + bottomRightLut[lIndex] * weightX;
      const equalized = topValue * (1 - weightY) + bottomValue * weightY;
      const delta = (equalized - l) * strength;

      if (Math.abs(delta) < 0.5) continue;
      data[i] = clampByte(data[i] + delta);
      data[i + 1] = clampByte(data[i + 1] + delta);
      data[i + 2] = clampByte(data[i + 2] + delta);
    }
  }
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function findClip(histogram: Uint32Array, threshold: number, fromEnd: boolean): number {
  let count = 0;
  if (fromEnd) {
    for (let i = 255; i >= 0; i--) {
      count += histogram[i];
      if (count >= threshold) return i;
    }
    return 255;
  }

  for (let i = 0; i < 256; i++) {
    count += histogram[i];
    if (count >= threshold) return i;
  }
  return 0;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
