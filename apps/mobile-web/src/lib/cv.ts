/**
 * Web-only image enhancement utilities.
 * Uses Canvas + ImageData — never import this from native code.
 *
 * Pipeline: contrast boost → unsharp mask → percentile auto-levels → JPEG output
 */

/**
 * Capture and enhance a video frame for maximum text clarity.
 * Returns a JPEG data-URL or null if the video has no dimensions yet.
 */
export function enhanceCapture(video: HTMLVideoElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  // Canvas A: draw with initial contrast/brightness boost
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  setFilter(ctx, 'contrast(1.25) brightness(1.05)');
  ctx.drawImage(video, 0, 0);
  setFilter(ctx, 'none');

  // Canvas B: blurred copy for unsharp mask reference
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w;
  blurCanvas.height = h;
  const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
  if (!blurCtx) return null;
  setFilter(blurCtx, 'blur(1.5px)');
  blurCtx.drawImage(video, 0, 0);

  const origData = ctx.getImageData(0, 0, w, h);
  const blurData = blurCtx.getImageData(0, 0, w, h);

  applyUnsharpMask(origData.data, blurData.data, 1.8);
  applyAutoLevels(origData.data, w * h);

  ctx.putImageData(origData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.97);
}

// ── Internals ────────────────────────────────────────────────────────────────

function setFilter(ctx: CanvasRenderingContext2D, value: string): void {
  if ('filter' in ctx) (ctx as CanvasRenderingContext2D & { filter: string }).filter = value;
}

function applyUnsharpMask(
  data: Uint8ClampedArray,
  blur: Uint8ClampedArray,
  amount: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = clamp(data[i]   + amount * (data[i]   - blur[i]));
    data[i + 1] = clamp(data[i + 1] + amount * (data[i + 1] - blur[i + 1]));
    data[i + 2] = clamp(data[i + 2] + amount * (data[i + 2] - blur[i + 2]));
    // alpha unchanged
  }
}

function applyAutoLevels(data: Uint8ClampedArray, pixelCount: number): void {
  const rH = new Uint32Array(256);
  const gH = new Uint32Array(256);
  const bH = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    rH[data[i]]++;
    gH[data[i + 1]]++;
    bH[data[i + 2]]++;
  }

  // Clip 0.5 % at each tail to avoid single-pixel outliers dominating the stretch
  const clip = Math.max(1, Math.round(pixelCount * 0.005));
  const rLo = findClip(rH, clip, false), rHi = findClip(rH, clip, true);
  const gLo = findClip(gH, clip, false), gHi = findClip(gH, clip, true);
  const bLo = findClip(bH, clip, false), bHi = findClip(bH, clip, true);

  const rR = rHi - rLo || 1;
  const gR = gHi - gLo || 1;
  const bR = bHi - bLo || 1;

  for (let i = 0; i < data.length; i += 4) {
    data[i]   = clamp(((data[i]   - rLo) / rR) * 255);
    data[i + 1] = clamp(((data[i + 1] - gLo) / gR) * 255);
    data[i + 2] = clamp(((data[i + 2] - bLo) / bR) * 255);
  }
}

function findClip(hist: Uint32Array, threshold: number, fromEnd: boolean): number {
  let count = 0;
  if (fromEnd) {
    for (let i = 255; i >= 0; i--) {
      count += hist[i];
      if (count >= threshold) return i;
    }
    return 255;
  }
  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= threshold) return i;
  }
  return 0;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
