/**
 * Document quad detection and perspective warp — pure TypeScript, no deps.
 * Web-only: detectAndOverlay / warpAndCrop use window.Image + Canvas.
 * detectQuad / warpPerspective operate on ImageData and are side-effect-free.
 */

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
  const thresh = otsuThreshold(edges);
  const corners = findExtremeCorners(edges, w, h, thresh * 0.45);
  if (!corners) return null;

  if (!isValidQuad(corners, w, h)) return null;
  if (quadArea(corners) < w * h * 0.12) return null;

  return corners.map(([x, y]) => [
    Math.min(Math.round(x / scale), origW - 1),
    Math.min(Math.round(y / scale), origH - 1),
  ]) as QuadCorners;
}

/**
 * Warp imageData so the quad fills a flat rectangle.
 * Output dimensions are derived from the quad edge lengths.
 */
export function warpPerspective(src: ImageData, corners: QuadCorners): ImageData {
  const [tl, tr, br, bl] = corners;

  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  if (outW < 8 || outH < 8) return src;

  const dstCorners: QuadCorners = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const H = computeHomographyDLT(dstCorners, corners);
  if (!H) return src;

  const srcD = src.data;
  const srcW = src.width;
  const srcH = src.height;
  const out = new ImageData(outW, outH);
  const outD = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const oi = (y * outW + x) * 4;
      if (x0 >= 0 && y0 >= 0 && x0 + 1 < srcW && y0 + 1 < srcH) {
        const a = (y0 * srcW + x0) * 4;
        const b = (y0 * srcW + x0 + 1) * 4;
        const c = ((y0 + 1) * srcW + x0) * 4;
        const d = ((y0 + 1) * srcW + x0 + 1) * 4;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        outD[oi]     = w00 * srcD[a]     + w10 * srcD[b]     + w01 * srcD[c]     + w11 * srcD[d];
        outD[oi + 1] = w00 * srcD[a + 1] + w10 * srcD[b + 1] + w01 * srcD[c + 1] + w11 * srcD[d + 1];
        outD[oi + 2] = w00 * srcD[a + 2] + w10 * srcD[b + 2] + w01 * srcD[c + 2] + w11 * srcD[d + 2];
        outD[oi + 3] = 255;
      } else if (x0 >= 0 && y0 >= 0 && x0 < srcW && y0 < srcH) {
        const a = (y0 * srcW + x0) * 4;
        outD[oi] = srcD[a]; outD[oi + 1] = srcD[a + 1];
        outD[oi + 2] = srcD[a + 2]; outD[oi + 3] = 255;
      }
    }
  }
  return out;
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
  let tlS = -Infinity, trS = -Infinity, brS = -Infinity, blS = -Infinity;
  let tl: Point = [cx | 0, cy | 0], tr: Point = [cx | 0, cy | 0];
  let br: Point = [cx | 0, cy | 0], bl: Point = [cx | 0, cy | 0];
  let hits = 0;

  const mx = Math.round(w * 0.04);
  const my = Math.round(h * 0.04);

  for (let y = my; y < h - my; y++) {
    for (let x = mx; x < w - mx; x++) {
      if (edges[y * w + x] < thresh) continue;
      hits++;
      const dx = x - cx, dy = y - cy;
      if (-dx - dy > tlS) { tlS = -dx - dy; tl = [x, y]; }
      if ( dx - dy > trS) { trS =  dx - dy; tr = [x, y]; }
      if ( dx + dy > brS) { brS =  dx + dy; br = [x, y]; }
      if (-dx + dy > blS) { blS = -dx + dy; bl = [x, y]; }
    }
  }

  return hits > 20 ? [tl, tr, br, bl] : null;
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
