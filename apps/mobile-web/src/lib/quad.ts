/**
 * Document quad detection and perspective warp — pure TypeScript, no deps.
 * Web-only: detectAndOverlay / warpAndCrop use window.Image + Canvas.
 * detectQuad / warpPerspective operate on ImageData and are side-effect-free.
 */

import { CONFIG } from '@/config';
import { applyFocusRecovery } from '@/lib/focus-recovery';

export type Point = [number, number];
export type QuadCorners = [Point, Point, Point, Point]; // [TL, TR, BR, BL]

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Detect the largest document/screen quad in an ImageData.
 * Works at ≤ 640px internally for speed; corners are returned in original pixel space.
 * Returns [TL, TR, BR, BL] or null if no clear quad found.
 */
export function detectQuad(imageData: ImageData): QuadCorners | null {
  const { data, width: origW, height: origH } = imageData;

  const scale = Math.min(1, 640 / origW);
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(Math.round(x / scale), origW - 1);
      const sy = Math.min(Math.round(y / scale), origH - 1);
      const si = (sy * origW + sx) * 4;
      gray[y * w + x] = (data[si] * 77 + data[si + 1] * 150 + data[si + 2] * 29) >> 8;
    }
  }

  const blurred = blur5x5(gray, w, h);
  const edges = sobelMagnitude(blurred, w, h);
  const otsu = otsuThreshold(edges);
  // Otsu can return zero for a flat/noisy frame. Never treat every pixel as an
  // edge: that was the source of false full-frame quads and missing overlays.
  const thresh = Math.max(18, Math.round(otsu * 0.55));
  const corners = findExtremeCorners(edges, w, h, thresh);
  if (!corners) return null;

  if (!isValidQuad(corners, w, h)) return null;
  if (quadArea(corners) < w * h * 0.12) return null;
  if (quadEdgeSupport(edges, w, h, corners, thresh) < 0.42) return null;

  return corners.map(([x, y]) => [
    Math.min(Math.round(x / scale), origW - 1),
    Math.min(Math.round(y / scale), origH - 1),
  ]) as QuadCorners;
}

/**
 * Warp imageData so the quad fills a flat rectangle.
 * Output dimensions are derived from the quad edge lengths.
 */
/**
 * Smooth small frame-to-frame corner movement while allowing a large move to
 * re-lock immediately. Coordinates are expected to share the same image size.
 */
export function smoothQuad(
  previous: QuadCorners | null,
  next: QuadCorners,
  width: number,
  height: number,
  alpha: number,
  movementThreshold: number,
): QuadCorners {
  if (!previous) return next;
  const diagonal = Math.hypot(width, height);
  const movement = Math.max(
    ...next.map(([x, y], i) => dist([x, y], previous[i]))
  ) / diagonal;
  if (movement > movementThreshold) return next;
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return next.map(([x, y], i) => [
    Math.round(previous[i][0] + (x - previous[i][0]) * clampedAlpha),
    Math.round(previous[i][1] + (y - previous[i][1]) * clampedAlpha),
  ]) as QuadCorners;
}

export function warpPerspective(src: ImageData, corners: QuadCorners): ImageData {
  const warped = warpPixels(src, corners);
  if (!warped) return src;
  const out = new ImageData(warped.width, warped.height);
  out.data.set(warped.data);
  return out;
}

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Perspective-warp the quad to a flat rectangle with Catmull-Rom bicubic
 * sampling. Bilinear sampling averages neighbours and visibly softens small
 * text (measured edge sharpness 0.79 → 0.61 on a real capture; bicubic keeps
 * 0.67). Pure, so Vitest covers it. Returns null for a degenerate quad.
 */
export function warpPixels(src: Pixels, corners: QuadCorners): Pixels | null {
  const [tl, tr, br, bl] = corners;

  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  if (outW < 8 || outH < 8) return null;

  const dstCorners: QuadCorners = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const H = computeHomographyDLT(dstCorners, corners);
  if (!H) return null;

  const srcD = src.data;
  const srcW = src.width;
  const srcH = src.height;
  const outD = new Uint8ClampedArray(outW * outH * 4);
  const wx = new Float64Array(4);
  const wy = new Float64Array(4);
  const cols = new Int32Array(4);
  const rows = new Int32Array(4);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;
      const oi = (y * outW + x) * 4;
      outD[oi + 3] = 255;
      if (sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      catmullRom(sx - x0, wx);
      catmullRom(sy - y0, wy);
      for (let k = 0; k < 4; k++) {
        cols[k] = Math.min(srcW - 1, Math.max(0, x0 - 1 + k)) * 4;
        rows[k] = Math.min(srcH - 1, Math.max(0, y0 - 1 + k)) * srcW * 4;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < 4; j++) {
        const row = rows[j];
        const w = wy[j];
        for (let i = 0; i < 4; i++) {
          const weight = w * wx[i];
          const si = row + cols[i];
          r += weight * srcD[si];
          g += weight * srcD[si + 1];
          b += weight * srcD[si + 2];
        }
      }
      outD[oi] = r;
      outD[oi + 1] = g;
      outD[oi + 2] = b;
    }
  }
  return { data: outD, width: outW, height: outH };
}

/** Catmull-Rom weights for taps at -1, 0, 1, 2 around fraction `t`. */
function catmullRom(t: number, out: Float64Array): void {
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = (-t3 + 2 * t2 - t) / 2;
  out[1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[3] = (t3 - t2) / 2;
}

/**
 * Load a JPEG data-URL, detect quad, draw a blue overlay, return the overlay URL + corners.
 * If no quad found, corners is null and overlayDataUrl equals the input.
 */
export function detectAndOverlay(
  dataUrl: string,
): Promise<{ corners: QuadCorners | null; overlayDataUrl: string }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve({ corners: null, overlayDataUrl: dataUrl }); return; }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const corners = detectQuad(imageData);

      if (corners) {
        const lw = Math.max(2, Math.round(canvas.width / 280));
        const r = Math.max(6, Math.round(canvas.width / 140));
        ctx.strokeStyle = '#007AFF';
        ctx.lineWidth = lw;
        ctx.fillStyle = 'rgba(0,122,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#007AFF';
        for (const [x, y] of corners) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      resolve({
        corners,
        overlayDataUrl: canvas.toDataURL('image/jpeg', 0.93),
      });
    };
    img.onerror = () => resolve({ corners: null, overlayDataUrl: dataUrl });
    img.src = dataUrl;
  });
}

/**
 * Load a JPEG data-URL, warp the quad to a flat rectangle, return the new JPEG data-URL.
 */
export function warpAndCrop(dataUrl: string, corners: QuadCorners): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);
      const warped = warpPerspective(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        corners,
      );
      // Resampling (and stretching the far edge) costs some edge detail; win it back.
      applyFocusRecovery(warped.data, warped.width, warped.height, {
        fineAmount: CONFIG.CROP_FOCUS_FINE,
        coarseAmount: CONFIG.CROP_FOCUS_COARSE,
        overshoot: CONFIG.CROP_FOCUS_OVERSHOOT,
        chromaSigma: 0,
      });
      const out = document.createElement('canvas');
      out.width = warped.width;
      out.height = warped.height;
      out.getContext('2d')!.putImageData(warped, 0, 0);
      resolve(out.toDataURL('image/jpeg', 0.97));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Image processing primitives ────────────────────────────────────────────────

function blur5x5(src: Uint8Array, w: number, h: number): Uint8Array {
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        s += src[y * w + Math.min(Math.max(x + i, 0), w - 1)] * k[i + 2];
      }
      tmp[y * w + x] = (s / kSum) | 0;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        s += tmp[Math.min(Math.max(y + i, 0), h - 1) * w + x] * k[i + 2];
      }
      dst[y * w + x] = (s / kSum) | 0;
    }
  }
  return dst;
}

function sobelMagnitude(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -src[(y - 1) * w + x - 1] - 2 * src[y * w + x - 1] - src[(y + 1) * w + x - 1]
        + src[(y - 1) * w + x + 1] + 2 * src[y * w + x + 1] + src[(y + 1) * w + x + 1];
      const gy =
        -src[(y - 1) * w + x - 1] - 2 * src[(y - 1) * w + x] - src[(y - 1) * w + x + 1]
        + src[(y + 1) * w + x - 1] + 2 * src[(y + 1) * w + x] + src[(y + 1) * w + x + 1];
      dst[y * w + x] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 2);
    }
  }
  return dst;
}

function otsuThreshold(data: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (const v of data) hist[v]++;
  const total = data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, maxVar = 0, thresh = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > maxVar) { maxVar = v; thresh = t; }
  }
  return thresh;
}

function findExtremeCorners(
  edges: Uint8Array,
  w: number,
  h: number,
  thresh: number,
): QuadCorners | null {
  const cx = w / 2, cy = h / 2;
  const candidates: Point[][] = [[], [], [], []];
  let hits = 0;
  const mx = Math.round(w * 0.02);
  const my = Math.round(h * 0.02);
  const minSpacing = Math.max(3, Math.round(Math.min(w, h) * 0.012));

  for (let y = my; y < h - my; y++) {
    for (let x = mx; x < w - mx; x++) {
      if (edges[y * w + x] < thresh) continue;
      hits++;
      const quadrant = x <= cx ? (y <= cy ? 0 : 3) : (y <= cy ? 1 : 2);
      const list = candidates[quadrant];
      // Keep spatially distinct high-quality candidates. This lets edge
      // support choose a real corner instead of a piece of printed text.
      const dx = x - cx;
      const dy = y - cy;
      const score = quadrant === 0 ? -dx - dy
        : quadrant === 1 ? dx - dy
          : quadrant === 2 ? dx + dy : -dx + dy;
      const point = [x, y] as Point;
      // Keep the highest-scoring spatially distinct points. The previous
      // implementation removed existing points near the new one, which
      // deleted real corners as the scan moved along an edge.
      if (list.some((candidate) => dist(candidate, point) < minSpacing)) continue;
      const insertAt = list.findIndex((candidate) => {
        const cdx = candidate[0] - cx;
        const cdy = candidate[1] - cy;
        const candidateScore = quadrant === 0 ? -cdx - cdy
          : quadrant === 1 ? cdx - cdy
            : quadrant === 2 ? cdx + cdy : -cdx + cdy;
        return score > candidateScore;
      });
      if (insertAt >= 0) list.splice(insertAt, 0, point);
      else list.push(point);
      if (list.length > CONFIG.QUAD_MAX_CANDIDATES) list.length = CONFIG.QUAD_MAX_CANDIDATES;
    }
  }

  if (hits < 30 || candidates.some((list) => list.length === 0)) return null;

  let best: QuadCorners | null = null;
  let bestScore = -Infinity;
  const startedAt = Date.now();
  let attempts = 0;
  outer: for (const tl of candidates[0]) {
    for (const tr of candidates[1]) {
      for (const br of candidates[2]) {
        for (const bl of candidates[3]) {
          // Keep the main thread responsive on low-end phones. If the budget
          // runs out, return the best quad found so far instead of freezing.
          if ((++attempts & 0x3ff) === 0 && Date.now() - startedAt > CONFIG.QUAD_DETECTION_BUDGET_MS) {
            break outer;
          }
          const quad: QuadCorners = [tl, tr, br, bl];
          if (!isValidQuad(quad, w, h) || quadArea(quad) < w * h * 0.12) continue;
          const support = quadEdgeSupport(edges, w, h, quad, thresh);
          const score = support * 4 + quadArea(quad) / (w * h);
          if (score > bestScore) {
            best = quad;
            bestScore = score;
          }
        }
      }
    }
  }
  return best;
}

/** Fraction of samples near an edge that contain a strong gradient. */
function quadEdgeSupport(
  edges: Uint8Array,
  w: number,
  h: number,
  corners: QuadCorners,
  thresh: number,
): number {
  const radius = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  let supported = 0;
  let total = 0;
  for (let side = 0; side < 4; side++) {
    const [x1, y1] = corners[side];
    const [x2, y2] = corners[(side + 1) % 4];
    const length = Math.max(8, Math.round(dist(corners[side], corners[(side + 1) % 4]) / 12));
    const nx = -(y2 - y1) / Math.max(1, dist([x1, y1], [x2, y2]));
    const ny = (x2 - x1) / Math.max(1, dist([x1, y1], [x2, y2]));
    for (let i = 1; i < length; i++) {
      const t = i / length;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      let hit = false;
      for (let r = -radius; r <= radius; r++) {
        const px = Math.round(x + nx * r);
        const py = Math.round(y + ny * r);
        if (px >= 0 && px < w && py >= 0 && py < h && edges[py * w + px] >= thresh) {
          hit = true;
          break;
        }
      }
      if (hit) supported++;
      total++;
    }
  }
  return total ? supported / total : 0;
}

function isValidQuad(corners: QuadCorners, w: number, h: number): boolean {
  const minDist = Math.hypot(w, h) * 0.08;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (dist(corners[i], corners[j]) < minDist) return false;
    }
  }
  // Convexity check
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    const [x3, y3] = corners[(i + 2) % 4];
    const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
    if (Math.abs(cross) < 1) continue;
    const s = cross > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function quadArea(corners: QuadCorners): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function dist([x1, y1]: Point, [x2, y2]: Point): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

// ── Homography (DLT, 4-point correspondences) ──────────────────────────────────

/**
 * Compute H mapping src[i] → dst[i].
 * Returns [h00,h01,h02,h10,h11,h12,h20,h21] with h22=1, or null if degenerate.
 */
function computeHomographyDLT(src: QuadCorners, dst: QuadCorners): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [xp, yp] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    b.push(yp);
  }
  return gaussianElimination(A, b);
}

function gaussianElimination(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let j = i + 1; j < n; j++) x[i] -= (M[i][j] / M[i][i]) * x[j];
  }
  return x;
}
