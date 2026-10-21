/**
 * Focus recovery for photographed screens. Pure pixel code (Vitest-tested).
 *
 * A phone aimed up at a monitor has the near edge in focus and the far edge
 * outside the depth of field, so a capture is sharp at the bottom and soft at
 * the top. A uniform sharpen either leaves the top soft or over-sharpens the
 * bottom. This pass measures blur per tile and sharpens each region by what
 * it lacks:
 *
 * 1. Chroma smoothing — low-pass Cb/Cr only, which removes the rainbow moiré
 *    of a pixel grid without touching glyph edges (text lives in luma).
 * 2. Defocus map — content-independent edge sharpness (Laplacian over
 *    gradient on the strongest edges) per tile, as a deficit against the
 *    sharpest tiles.
 * 3. Two-scale luma sharpening — a fine detail layer everywhere (boosted in
 *    blurry tiles) plus a coarse layer only where the map says blurry, which
 *    is what restores defocused strokes.
 * 4. Overshoot control — the result stays inside the local 5×5 range plus a
 *    small margin, so edges get steeper without dark/bright halos.
 *
 * Work runs in horizontal strips so a 4K frame never needs more than a few
 * strip-sized float buffers.
 */

export type FocusRecoveryOptions = {
  /** Fine detail gain (σ≈1.4 px); doubled in the blurriest tiles. */
  fineAmount?: number;
  /** Coarse detail gain (σ≈2.4 px), applied in proportion to the defocus map. */
  coarseAmount?: number;
  /** Detail below this many luma levels is treated as noise. */
  threshold?: number;
  /** How far past the local 5×5 min/max a pixel may go. */
  overshoot?: number;
  /** Chroma blur sigma in px; 0 disables anti-moiré. */
  chromaSigma?: number;
  tilesX?: number;
  tilesY?: number;
};

export type FocusReport = {
  /** The side of the frame that measured clearly softer than the opposite side, if any. */
  softEdge: 'top' | 'bottom' | 'left' | 'right' | null;
  /** Mean sharpness deficit of that side minus the opposite side (0..1). */
  spread: number;
};

const STRIP_ROWS = 256;
/** Enough rows above/below a strip for the widest blur (3 box passes, r=2) and the 5×5 range. */
const STRIP_MARGIN = 16;

export function applyFocusRecovery(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: FocusRecoveryOptions = {},
  softEdgeSpread = 0.2,
): FocusReport {
  const none: FocusReport = { softEdge: null, spread: 0 };
  if (width < 8 || height < 8 || data.length < width * height * 4) return none;
  const fineAmount = options.fineAmount ?? 0.5;
  const coarseAmount = options.coarseAmount ?? 1.2;
  const threshold = options.threshold ?? 1.5;
  const overshoot = options.overshoot ?? 6;
  const chromaRadius = boxRadius(options.chromaSigma ?? 2.5);
  const tilesX = Math.max(1, Math.min(options.tilesX ?? 12, Math.floor(width / 16)));
  const tilesY = Math.max(1, Math.min(options.tilesY ?? 8, Math.floor(height / 16)));

  const fullLuma = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < fullLuma.length; p++, i += 4) {
    fullLuma[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
  const raw = defocusMap(fullLuma, width, height, tilesX, tilesY);
  const report = softEdgeReport(raw, tilesX, tilesY, softEdgeSpread);
  // Scale so a frame with only mild blur gets only mild help.
  const deficit = raw.slice();
  let worst = 0;
  for (let i = 0; i < deficit.length; i++) worst = Math.max(worst, deficit[i]);
  if (worst > 0) {
    const gain = Math.min(1, worst * 2.5) / worst;
    for (let i = 0; i < deficit.length; i++) deficit[i] *= gain;
  }
  const fineRadius = boxRadius(1.0);
  const coarseRadius = boxRadius(2.4);

  for (let s0 = 0; s0 < height; s0 += STRIP_ROWS) {
    const s1 = Math.min(height, s0 + STRIP_ROWS);
    const p0 = Math.max(0, s0 - STRIP_MARGIN);
    const p1 = Math.min(height, s1 + STRIP_MARGIN);
    const rows = p1 - p0;
    const n = rows * width;

    const y = new Float32Array(n);
    const cb = new Float32Array(n);
    const cr = new Float32Array(n);
    for (let p = 0, i = p0 * width * 4; p < n; p++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      y[p] = l;
      cb[p] = b - l;
      cr[p] = r - l;
    }

    const scratch = new Float32Array(n);
    if (chromaRadius > 0) {
      gaussian3(cb, width, rows, chromaRadius, scratch);
      gaussian3(cr, width, rows, chromaRadius, scratch);
    }
    const fine = y.slice();
    gaussian3(fine, width, rows, fineRadius, scratch);
    const coarse = y.slice();
    gaussian3(coarse, width, rows, coarseRadius, scratch);
    const lo = y.slice();
    const hi = y.slice();
    rangeFilter5(lo, hi, width, rows, scratch);

    for (let row = s0; row < s1; row++) {
      const local = row - p0;
      const fy = ((row + 0.5) / height) * tilesY - 0.5;
      for (let x = 0; x < width; x++) {
        const p = local * width + x;
        const d = sampleGrid(deficit, tilesX, tilesY, ((x + 0.5) / width) * tilesX - 0.5, fy);
        const l = y[p];
        let out =
          l +
          fineAmount * (1 + d) * soft(l - fine[p], threshold) +
          coarseAmount * d * soft(l - coarse[p], threshold + 0.5);
        const min = lo[p] - overshoot;
        const max = hi[p] + overshoot;
        out = out < min ? min : out > max ? max : out;

        const red = out + cr[p];
        const blue = out + cb[p];
        const green = (out - 0.299 * red - 0.114 * blue) / 0.587;
        const i = (row * width + x) * 4;
        data[i] = clampByte(red);
        data[i + 1] = clampByte(green);
        data[i + 2] = clampByte(blue);
      }
    }
  }
  return report;
}

/** Compare the outer tile rows/columns to name the side that is out of focus. */
export function softEdgeReport(deficit: Float32Array, tilesX: number, tilesY: number, minSpread: number): FocusReport {
  const mean = (cells: number[]) => cells.reduce((sum, i) => sum + deficit[i], 0) / Math.max(1, cells.length);
  const band = Math.max(1, Math.round(Math.min(tilesX, tilesY) / 4));
  const rows = (from: number) => Array.from({ length: band * tilesX }, (_, k) => (from + Math.floor(k / tilesX)) * tilesX + (k % tilesX));
  const cols = (from: number) => Array.from({ length: band * tilesY }, (_, k) => (k % tilesY) * tilesX + from + Math.floor(k / tilesY));
  const candidates: [FocusReport['softEdge'], number][] = [
    ['top', mean(rows(0)) - mean(rows(tilesY - band))],
    ['bottom', mean(rows(tilesY - band)) - mean(rows(0))],
    ['left', mean(cols(0)) - mean(cols(tilesX - band))],
    ['right', mean(cols(tilesX - band)) - mean(cols(0))],
  ];
  const [edge, spread] = candidates.reduce((best, next) => (next[1] > best[1] ? next : best));
  return spread >= minSpread ? { softEdge: edge, spread } : { softEdge: null, spread: Math.max(0, spread) };
}

/**
 * Per-tile defocus deficit in 0..1 (0 = as sharp as the sharpest tiles).
 * Sharpness is Laplacian / gradient on each tile's strongest 10% of edges,
 * which does not depend on how much text a tile happens to contain.
 */
export function defocusMap(
  luma: Uint8Array,
  width: number,
  height: number,
  tilesX: number,
  tilesY: number,
): Float32Array {
  const scores = new Float32Array(tilesX * tilesY);
  const valid = new Uint8Array(tilesX * tilesY);
  const histogram = new Uint32Array(511);

  for (let ty = 0; ty < tilesY; ty++) {
    const y0 = Math.max(1, Math.floor((ty * height) / tilesY));
    const y1 = Math.min(height - 1, Math.floor(((ty + 1) * height) / tilesY));
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.max(1, Math.floor((tx * width) / tilesX));
      const x1 = Math.min(width - 1, Math.floor(((tx + 1) * width) / tilesX));
      histogram.fill(0);
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = yy * width + xx;
          histogram[Math.abs(luma[p + 1] - luma[p]) + Math.abs(luma[p + width] - luma[p])]++;
          count++;
        }
      }
      if (count === 0) continue;
      // 90th-percentile gradient marks the tile's real edges.
      let cutoff = 510;
      for (let seen = 0, target = count * 0.1; cutoff > 0; cutoff--) {
        seen += histogram[cutoff];
        if (seen >= target) break;
      }
      if (cutoff < 8) continue; // Flat tile: nothing to judge.
      let lapSum = 0;
      let gradSum = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = yy * width + xx;
          const g = Math.abs(luma[p + 1] - luma[p]) + Math.abs(luma[p + width] - luma[p]);
          if (g < cutoff) continue;
          lapSum += Math.abs(4 * luma[p] - luma[p - 1] - luma[p + 1] - luma[p - width] - luma[p + width]);
          gradSum += g;
        }
      }
      if (gradSum > 0) {
        scores[ty * tilesX + tx] = lapSum / gradSum;
        valid[ty * tilesX + tx] = 1;
      }
    }
  }

  const known = Array.from(scores).filter((_, i) => valid[i]).sort((a, b) => a - b);
  const deficit = new Float32Array(tilesX * tilesY);
  if (known.length === 0) return deficit;
  const reference = known[Math.min(known.length - 1, Math.floor(known.length * 0.85))];
  if (reference <= 0) return deficit;

  for (let i = 0; i < deficit.length; i++) {
    deficit[i] = valid[i] ? Math.min(1, Math.max(0, (reference - scores[i]) / reference)) : 0;
  }
  return deficit;
}

/** Box radius whose three passes approximate a Gaussian of `sigma`. */
function boxRadius(sigma: number): number {
  if (sigma <= 0) return 0;
  return Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2 - 0.5));
}

/** In-place approximate Gaussian: three separable box passes. */
function gaussian3(a: Float32Array, width: number, height: number, radius: number, tmp: Float32Array): void {
  for (let pass = 0; pass < 3; pass++) {
    boxRows(a, tmp, width, height, radius);
    boxColumns(tmp, a, width, height, radius);
  }
}

function boxRows(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
  const scale = 1 / (2 * r + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = src[row] * (r + 1);
    for (let k = 1; k <= r; k++) sum += src[row + Math.min(width - 1, k)];
    for (let x = 0; x < width; x++) {
      dst[row + x] = sum * scale;
      sum += src[row + Math.min(width - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}

function boxColumns(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
  const scale = 1 / (2 * r + 1);
  for (let x = 0; x < width; x++) {
    let sum = src[x] * (r + 1);
    for (let k = 1; k <= r; k++) sum += src[Math.min(height - 1, k) * width + x];
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum * scale;
      sum += src[Math.min(height - 1, y + r + 1) * width + x] - src[Math.max(0, y - r) * width + x];
    }
  }
}

/** In-place 5×5 min (into `lo`) and max (into `hi`), separable. */
function rangeFilter5(lo: Float32Array, hi: Float32Array, width: number, height: number, tmp: Float32Array): void {
  extreme5(lo, tmp, width, height, true, false);
  extreme5(tmp, lo, width, height, false, false);
  extreme5(hi, tmp, width, height, true, true);
  extreme5(tmp, hi, width, height, false, true);
}

function extreme5(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  horizontal: boolean,
  takeMax: boolean,
): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const lineStep = horizontal ? width : 1;
  const last = length - 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let k = 0; k < length; k++) {
      let v = src[base + k * stride];
      for (let o = -2; o <= 2; o++) {
        const kk = k + o < 0 ? 0 : k + o > last ? last : k + o;
        const sample = src[base + kk * stride];
        if (takeMax ? sample > v : sample < v) v = sample;
      }
      dst[base + k * stride] = v;
    }
  }
}

function sampleGrid(grid: Float32Array, tilesX: number, tilesY: number, gx: number, gy: number): number {
  const x0 = Math.min(tilesX - 1, Math.max(0, Math.floor(gx)));
  const y0 = Math.min(tilesY - 1, Math.max(0, Math.floor(gy)));
  const x1 = Math.min(tilesX - 1, x0 + 1);
  const y1 = Math.min(tilesY - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, gx - x0));
  const fy = Math.min(1, Math.max(0, gy - y0));
  const top = grid[y0 * tilesX + x0] * (1 - fx) + grid[y0 * tilesX + x1] * fx;
  const bottom = grid[y1 * tilesX + x0] * (1 - fx) + grid[y1 * tilesX + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function soft(value: number, threshold: number): number {
  return value > threshold ? value - threshold : value < -threshold ? value + threshold : 0;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
