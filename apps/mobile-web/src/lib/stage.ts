/**
 * Projector stage: the phone-shaped canvas Admin composes and the Projector
 * shows full-screen. Geometry helpers are pure (Vitest-tested); `renderStage`
 * only needs a CanvasRenderingContext2D-like target, so it runs on web.
 *
 * Layer coordinates are normalized to the stage so the same scene renders
 * identically in the small Admin preview and at the Projector's pixel size.
 */

export type Viewport = { w: number; h: number; dpr: number };

/** `projector` uses the connected phone's exact screen aspect. */
export type StageShape = 'projector' | '9:16' | '3:4' | '1:1';

export type ImageRotation = 0 | 90 | 180 | 270;

export type StageImageLayer = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Image centre as a fraction of stage width/height. */
  cx: number;
  cy: number;
  /** Multiplier on the contain-fit size: 1 = Fit. */
  scale: number;
  rotation: ImageRotation;
};

export type StageTextLayer = {
  text: string;
  /** Top-left corner as a fraction of stage width/height. */
  x: number;
  y: number;
  /** Font size as a fraction of stage width. */
  size: number;
  color: string;
  mono: boolean;
};

export type StageScene = {
  background: string;
  image: StageImageLayer | null;
  text: StageTextLayer | null;
};

export const EMPTY_SCENE: StageScene = { background: '#000000', image: null, text: null };

export const MIN_IMAGE_SCALE = 0.2;
export const MAX_IMAGE_SCALE = 8;
export const MIN_TEXT_SIZE = 0.025;
export const MAX_TEXT_SIZE = 0.2;
const TEXT_PADDING = 0.04;
const LINE_HEIGHT = 1.3;
const SANS_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Phone fallback until the Projector reports its real screen. */
export const DEFAULT_VIEWPORT: Viewport = { w: 390, h: 844, dpr: 3 };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isPortrait(viewport: Viewport): boolean {
  return viewport.h >= viewport.w;
}

/**
 * Stage width/height ratio. Preset shapes follow the Projector's orientation;
 * `rotated` turns the frame sideways (the Projector user turns the phone).
 */
export function stageAspect(viewport: Viewport, shape: StageShape, rotated: boolean): number {
  const portrait = isPortrait(viewport);
  let aspect: number;
  switch (shape) {
    case '9:16':
      aspect = portrait ? 9 / 16 : 16 / 9;
      break;
    case '3:4':
      aspect = portrait ? 3 / 4 : 4 / 3;
      break;
    case '1:1':
      aspect = 1;
      break;
    default:
      aspect = viewport.w / viewport.h;
  }
  return rotated ? 1 / aspect : aspect;
}

/**
 * Pixel size of the rendered stage (in stage orientation). The long side
 * matches the Projector's physical long side, capped by `maxLongSide`.
 */
export function stageOutputSize(
  viewport: Viewport,
  aspect: number,
  maxLongSide: number,
): { width: number; height: number } {
  const physicalLong = Math.max(viewport.w, viewport.h) * Math.max(1, viewport.dpr);
  const longSide = Math.max(1, Math.round(Math.min(physicalLong, maxLongSide)));
  return aspect >= 1
    ? { width: longSide, height: Math.max(1, Math.round(longSide / aspect)) }
    : { width: Math.max(1, Math.round(longSide * aspect)), height: longSide };
}

function rotatedSize(layer: Pick<StageImageLayer, 'naturalWidth' | 'naturalHeight' | 'rotation'>) {
  const sideways = layer.rotation === 90 || layer.rotation === 270;
  return sideways
    ? { w: layer.naturalHeight, h: layer.naturalWidth }
    : { w: layer.naturalWidth, h: layer.naturalHeight };
}

/** Scale that fits the whole (rotated) image inside the stage. */
export function fitScale(
  layer: Pick<StageImageLayer, 'naturalWidth' | 'naturalHeight' | 'rotation'>,
  stageWidth: number,
  stageHeight: number,
): number {
  const { w, h } = rotatedSize(layer);
  if (w <= 0 || h <= 0) return 1;
  return Math.min(stageWidth / w, stageHeight / h);
}

/** `scale` value (relative to Fit) that fills the stage with no bars. */
export function fillScaleFactor(
  layer: Pick<StageImageLayer, 'naturalWidth' | 'naturalHeight' | 'rotation'>,
  aspect: number,
): number {
  const { w, h } = rotatedSize(layer);
  if (w <= 0 || h <= 0) return 1;
  const imageAspect = w / h;
  return Math.max(imageAspect / aspect, aspect / imageAspect);
}

export function createImageLayer(src: string, naturalWidth: number, naturalHeight: number): StageImageLayer {
  return { src, naturalWidth, naturalHeight, cx: 0.5, cy: 0.5, scale: 1, rotation: 0 };
}

export function createTextLayer(text: string): StageTextLayer {
  return { text, x: TEXT_PADDING, y: TEXT_PADDING, size: 0.06, color: '#FFFFFF', mono: false };
}

export function stageFont(layer: Pick<StageTextLayer, 'size' | 'mono'>, stageWidth: number): string {
  const px = Math.max(1, layer.size * stageWidth);
  return `${layer.mono ? 400 : 600} ${px}px ${layer.mono ? MONO_FONT : SANS_FONT}`;
}

/**
 * Word-wrap text to `maxWidth`. Explicit newlines are kept; words longer than
 * a line are broken by character so nothing overflows the stage.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    // Leading indentation is kept for code; spaces at a soft wrap are dropped.
    let wrapped = false;
    for (const token of paragraph.split(/(\s+)/)) {
      if (token === '') continue;
      const space = token.trim() === '';
      if (space && line === '' && wrapped) continue;
      if (measure(line + token) <= maxWidth) {
        line += token;
        continue;
      }
      if (space) {
        lines.push(line.trimEnd());
        line = '';
        wrapped = true;
        continue;
      }
      if (line.trim() !== '') {
        lines.push(line.trimEnd());
        line = '';
        wrapped = true;
      }
      // A word wider than a whole line is broken by character.
      for (const ch of token) {
        if (line !== '' && measure(line + ch) > maxWidth) {
          lines.push(line);
          line = ch;
          wrapped = true;
        } else {
          line += ch;
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

type DrawTarget = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'fillRect'
  | 'translate'
  | 'rotate'
  | 'drawImage'
  | 'fillText'
  | 'measureText'
> & {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  font: string;
  textBaseline: CanvasTextBaseline;
  imageSmoothingQuality?: ImageSmoothingQuality;
};

/** Draw the scene into a `width`×`height` target. `image` is the decoded layer source. */
export function renderStage(
  ctx: DrawTarget,
  scene: StageScene,
  image: CanvasImageSource | null,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, width, height);

  const layer = scene.image;
  if (layer && image) {
    const base = fitScale(layer, width, height) * layer.scale;
    const drawWidth = layer.naturalWidth * base;
    const drawHeight = layer.naturalHeight * base;
    ctx.save();
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.translate(layer.cx * width, layer.cy * height);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  const text = scene.text;
  if (text && text.text.trim() !== '') {
    ctx.font = stageFont(text, width);
    ctx.fillStyle = text.color;
    ctx.textBaseline = 'top';
    const left = text.x * width;
    const maxWidth = Math.max(1, width - left - TEXT_PADDING * width);
    const lineHeight = text.size * width * LINE_HEIGHT;
    const lines = wrapText(text.text, maxWidth, (s) => ctx.measureText(s).width);
    lines.forEach((line, index) => {
      ctx.fillText(line, left, text.y * height + index * lineHeight);
    });
  }
  ctx.restore();
}
