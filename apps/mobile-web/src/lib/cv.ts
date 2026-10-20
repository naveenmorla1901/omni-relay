/**
 * Web-only capture and image enhancement utilities.
 * Uses Canvas + ImageData — never import this from native code.
 *
 * Pipeline: sharpest live frame → contrast/brightness → auto-levels →
 * CLAHE local contrast → luma-only unsharp mask → JPEG output
 */

import { CONFIG } from '@/config';
import {
  applyAutoLevels,
  applyClahe,
  applyLumaUnsharp,
  scoreSharpness,
} from '@/lib/image-quality';

export type EnhancedCapture = {
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * Capture several live frames, keep the sharpest, then enhance it for text.
 * Returns null while the video has no usable dimensions.
 */
export async function captureAndEnhanceVideo(
  video: HTMLVideoElement,
): Promise<EnhancedCapture | null> {
  const bestFrame = await captureSharpestFrame(video);
  if (!bestFrame) return null;

  const dataUrl = enhanceCanvas(bestFrame);
  if (!dataUrl) return null;

  return { dataUrl, width: bestFrame.width, height: bestFrame.height };
}

async function captureSharpestFrame(video: HTMLVideoElement): Promise<HTMLCanvasElement | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const bestCanvas = document.createElement('canvas');
  bestCanvas.width = width;
  bestCanvas.height = height;
  const bestContext = bestCanvas.getContext('2d');
  if (!bestContext) return null;

  // Score a downscaled copy: this is cheap and suppresses sensor/moiré noise.
  const scoreWidth = Math.min(480, width);
  const scoreHeight = Math.max(1, Math.round((height * scoreWidth) / width));
  const scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = scoreWidth;
  scoreCanvas.height = scoreHeight;
  const scoreContext = scoreCanvas.getContext('2d', { willReadFrequently: true });
  if (!scoreContext) return null;

  let bestScore = -1;
  for (let sample = 0; sample < CONFIG.CAPTURE_SAMPLE_COUNT; sample++) {
    await waitForVideoFrame(video);
    scoreContext.drawImage(video, 0, 0, scoreWidth, scoreHeight);
    const scoreData = scoreContext.getImageData(0, 0, scoreWidth, scoreHeight);
    const score = scoreSharpness(scoreData.data, scoreWidth, scoreHeight);

    if (score > bestScore) {
      bestScore = score;
      // Re-draw at native resolution only when this frame is the new best.
      bestContext.drawImage(video, 0, 0, width, height);
    }
  }

  return bestScore >= 0 ? bestCanvas : null;
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const callbackVideo = video as unknown as {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    let settled = false;
    let callbackId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (callbackId !== null) callbackVideo.cancelVideoFrameCallback?.(callbackId);
      resolve();
    };

    const timeout = setTimeout(finish, CONFIG.CAPTURE_FRAME_TIMEOUT_MS);
    if (callbackVideo.requestVideoFrameCallback) {
      callbackId = callbackVideo.requestVideoFrameCallback(finish);
    }
  });
}

function enhanceCanvas(source: HTMLCanvasElement): string | null {
  const width = source.width;
  const height = source.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  setFilter(
    context,
    `contrast(${CONFIG.CAPTURE_CONTRAST}) brightness(${CONFIG.CAPTURE_BRIGHTNESS})`,
  );
  context.drawImage(source, 0, 0);
  setFilter(context, 'none');

  const imageData = context.getImageData(0, 0, width, height);
  applyAutoLevels(imageData.data, width * height);
  applyClahe(imageData.data, width, height, {
    tiles: CONFIG.CAPTURE_CLAHE_TILES,
    clipLimit: CONFIG.CAPTURE_CLAHE_CLIP_LIMIT,
    strength: CONFIG.CAPTURE_CLAHE_STRENGTH,
  });
  context.putImageData(imageData, 0, 0);

  // Blur the already-leveled frame so the unsharp mask only adds real edges.
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurContext = blurCanvas.getContext('2d', { willReadFrequently: true });
  if (!blurContext) return null;
  setFilter(blurContext, `blur(${CONFIG.CAPTURE_UNSHARP_BLUR_PX}px)`);
  blurContext.drawImage(canvas, 0, 0);

  const blurData = blurContext.getImageData(0, 0, width, height);
  applyLumaUnsharp(
    imageData.data,
    blurData.data,
    CONFIG.CAPTURE_UNSHARP_AMOUNT,
    CONFIG.CAPTURE_UNSHARP_THRESHOLD,
  );
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/jpeg', CONFIG.CAPTURE_JPEG_QUALITY);
}

function setFilter(context: CanvasRenderingContext2D, value: string): void {
  if ('filter' in context) {
    (context as CanvasRenderingContext2D & { filter: string }).filter = value;
  }
}

/** Rotate a JPEG data-URL by clockwise degrees (90 or -90/270). Returns a new data-URL. */
export function rotateImage(dataUrl: string, cwDegrees: 90 | 180 | 270 | -90): Promise<string> {
  const deg = ((cwDegrees % 360) + 360) % 360;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const swap = deg === 90 || deg === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const context = canvas.getContext('2d')!;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((deg * Math.PI) / 180);
      context.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', CONFIG.CAPTURE_JPEG_QUALITY));
    };
    img.src = dataUrl;
  });
}
