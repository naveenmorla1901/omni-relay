import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import { CONFIG } from '@/config';
import { useTheme } from '@/hooks/use-theme';
import {
  clamp,
  createImageLayer,
  createTextLayer,
  DEFAULT_VIEWPORT,
  EMPTY_SCENE,
  fillScaleFactor,
  MAX_IMAGE_SCALE,
  MAX_TEXT_SIZE,
  MIN_IMAGE_SCALE,
  MIN_TEXT_SIZE,
  renderStage,
  stageAspect,
  stageOutputSize,
} from '@/lib/stage';
import type { ImageRotation, StageScene, StageShape, Viewport } from '@/lib/stage';

type Props = {
  /** Projector screen; null until it reports (a typical phone is assumed). */
  viewport: Viewport | null;
  projectorReady: boolean;
  /** Admin's selected capture, offered as a one-click image source. */
  captureDataUrl: string | null;
  onFrame: (dataUrl: string, width: number, height: number) => void;
  onClear: () => void;
};

type DragTarget = 'image' | 'text';

const BEZEL = 10;
const SHAPES: { value: StageShape; label: string }[] = [
  { value: 'projector', label: 'Phone screen' },
  { value: '9:16', label: '9:16' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
];
const TEXT_COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#000000', label: 'Black' },
  { value: '#FFD60A', label: 'Yellow' },
];

/**
 * Admin's phone-shaped Projector stage. Whatever is inside the frame is
 * rendered at the Projector's physical resolution and shown full-screen there.
 * Drag to move, wheel/pinch to zoom; drop, paste, or choose images; type text.
 */
export function ProjectorStage({ viewport, projectorReady, captureDataUrl, onFrame, onClear }: Props) {
  const theme = useTheme();
  const [scene, setScene] = useState<StageScene>(EMPTY_SCENE);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [shape, setShape] = useState<StageShape>('projector');
  const [rotated, setRotated] = useState(false);
  const [target, setTarget] = useState<DragTarget>('image');
  const [live, setLive] = useState(true);
  const [fileDragging, setFileDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(320);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; value: number } | null>(null);
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const vp = viewport ?? DEFAULT_VIEWPORT;
  const aspect = stageAspect(vp, shape, rotated);
  const outputSize = stageOutputSize(vp, aspect, CONFIG.STAGE_MAX_LONG_SIDE);
  const hasContent = Boolean(scene.image || (scene.text && scene.text.text.trim() !== ''));

  // Fit the phone frame inside the pane width and the preview height cap.
  let cssWidth = Math.max(120, containerWidth - BEZEL * 2);
  let cssHeight = cssWidth / aspect;
  if (cssHeight > CONFIG.STAGE_PREVIEW_MAX_HEIGHT) {
    cssHeight = CONFIG.STAGE_PREVIEW_MAX_HEIGHT;
    cssWidth = cssHeight * aspect;
  }
  cssWidth = Math.round(cssWidth);
  cssHeight = Math.round(cssHeight);
  const radius = shape === 'projector' ? Math.round(Math.min(cssWidth, cssHeight) * 0.09) : 6;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Content sources ──────────────────────────────────────────────────────

  const loadImage = useCallback((src: string) => {
    const img = new window.Image();
    img.onload = () => {
      setImageEl(img);
      setScene((s) => ({ ...s, image: createImageLayer(src, img.naturalWidth, img.naturalHeight) }));
      setTarget('image');
    };
    img.src = src;
  }, []);

  const readFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') loadImage(reader.result);
    };
    reader.readAsDataURL(file);
  }, [loadImage]);

  const setText = useCallback((text: string) => {
    setScene((s) => {
      if (s.text) return { ...s, text: { ...s.text, text } };
      const layer = createTextLayer(text);
      return { ...s, text: { ...layer, color: s.background === '#FFFFFF' ? '#000000' : '#FFFFFF' } };
    });
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // Typing into the text box (or any input) keeps the normal paste.
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            readFile(item.getAsFile());
            return;
          }
        }
      }
      const text = event.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        event.preventDefault();
        setText(text);
        setTarget('text');
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [readFile, setText]);

  // ── Rendering ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) renderStage(ctx, scene, imageEl, canvas.width, canvas.height);
  }, [cssHeight, cssWidth, imageEl, scene]);

  /** Render at Projector pixels, turned back to its orientation when the frame is sideways. */
  const renderOutput = useCallback(() => {
    const { width, height } = stageOutputSize(vp, aspect, CONFIG.STAGE_MAX_LONG_SIDE);
    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = width;
    stageCanvas.height = height;
    const ctx = stageCanvas.getContext('2d');
    if (!ctx) return null;
    renderStage(ctx, scene, imageEl, width, height);

    let out = stageCanvas;
    if (rotated) {
      out = document.createElement('canvas');
      out.width = height;
      out.height = width;
      const rctx = out.getContext('2d');
      if (!rctx) return null;
      rctx.translate(out.width, 0);
      rctx.rotate(Math.PI / 2);
      rctx.drawImage(stageCanvas, 0, 0);
    }
    return {
      dataUrl: out.toDataURL('image/jpeg', CONFIG.STAGE_JPEG_QUALITY),
      width: out.width,
      height: out.height,
    };
  }, [aspect, imageEl, rotated, scene, vp]);

  const sendNow = useCallback(() => {
    const out = renderOutput();
    if (!out) return;
    onFrame(out.dataUrl, out.width, out.height);
    setStatus('Sent');
    setTimeout(() => setStatus(null), 1500);
  }, [onFrame, renderOutput]);

  // Live mode mirrors every settled edit to the Projector.
  useEffect(() => {
    if (!live || !projectorReady || !hasContent) return;
    const timer = setTimeout(() => {
      const out = renderOutput();
      if (out) onFrame(out.dataUrl, out.width, out.height);
    }, CONFIG.STAGE_SEND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hasContent, live, onFrame, projectorReady, renderOutput]);

  const clearScreen = useCallback(() => {
    setScene((s) => ({ ...EMPTY_SCENE, background: s.background }));
    setImageEl(null);
    onClear();
  }, [onClear]);

  // ── Direct manipulation ─────────────────────────────────────────────────

  const moveBy = useCallback((dx: number, dy: number) => {
    setScene((s) => {
      if (target === 'image' && s.image) {
        return {
          ...s,
          image: { ...s.image, cx: clamp(s.image.cx + dx, -0.5, 1.5), cy: clamp(s.image.cy + dy, -0.5, 1.5) },
        };
      }
      if (target === 'text' && s.text) {
        return { ...s, text: { ...s.text, x: clamp(s.text.x + dx, 0, 0.9), y: clamp(s.text.y + dy, 0, 0.95) } };
      }
      return s;
    });
  }, [target]);

  const setZoomValue = useCallback((value: number) => {
    setScene((s) => {
      if (target === 'image' && s.image) {
        return { ...s, image: { ...s.image, scale: clamp(value, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE) } };
      }
      if (target === 'text' && s.text) {
        return { ...s, text: { ...s.text, size: clamp(value, MIN_TEXT_SIZE, MAX_TEXT_SIZE) } };
      }
      return s;
    });
  }, [target]);

  const currentZoomValue = useCallback(() => {
    const s = sceneRef.current;
    return target === 'image' ? s.image?.scale ?? 1 : s.text?.size ?? MIN_TEXT_SIZE;
  }, [target]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!hasContent) return;
      event.preventDefault();
      setZoomValue(currentZoomValue() * Math.exp(-event.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [currentZoomValue, hasContent, setZoomValue]);

  const pointerDistance = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      pinchRef.current = { distance: pointerDistance(), value: currentZoomValue() };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      if (pinch.distance > 0) setZoomValue(pinch.value * (pointerDistance() / pinch.distance));
      return;
    }
    moveBy((event.clientX - previous.x) / cssWidth, (event.clientY - previous.y) / cssHeight);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  // ── Layer actions ───────────────────────────────────────────────────────

  const fitImage = () =>
    setScene((s) => (s.image ? { ...s, image: { ...s.image, cx: 0.5, cy: 0.5, scale: 1 } } : s));

  const fillImage = () =>
    setScene((s) =>
      s.image ? { ...s, image: { ...s.image, cx: 0.5, cy: 0.5, scale: fillScaleFactor(s.image, aspect) } } : s,
    );

  const rotateImage = () =>
    setScene((s) =>
      s.image ? { ...s, image: { ...s.image, rotation: ((s.image.rotation + 90) % 360) as ImageRotation } } : s,
    );

  const removeImage = () => {
    setScene((s) => ({ ...s, image: null }));
    setImageEl(null);
    setTarget('text');
  };

  const removeText = () => {
    setScene((s) => ({ ...s, text: null }));
    setTarget('image');
  };

  // ── UI ──────────────────────────────────────────────────────────────────

  const button = (active = false, disabled = false, color?: string): CSSProperties => ({
    border: `1px solid ${active ? theme.accent : theme.border}`,
    borderRadius: 8,
    padding: '6px 10px',
    background: active ? theme.backgroundSelected : theme.backgroundElement,
    color: color ?? theme.text,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    font: 'inherit',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
  });
  const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
  const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: theme.textSecondary, minWidth: 64 };
  const imageZoomLog = Math.log(scene.image?.scale ?? 1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: theme.text,
      }}>
      <div style={{ fontSize: 12, color: theme.textSecondary }}>
        {viewport
          ? `Projector screen ${Math.round(vp.w)}×${Math.round(vp.h)} @${Math.round(vp.dpr * 100) / 100}x · sends ${rotated ? outputSize.height : outputSize.width}×${rotated ? outputSize.width : outputSize.height}`
          : projectorReady
            ? 'Waiting for the Projector to report its screen…'
            : 'Projector not connected — previewing a typical phone screen.'}
      </div>

      <div
        ref={containerRef}
        style={{ width: '100%' }}
        onDragEnter={(event) => { event.preventDefault(); setFileDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setFileDragging(true); }}
        onDragLeave={() => setFileDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setFileDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            readFile(file);
            return;
          }
          const text = event.dataTransfer.getData('text/plain');
          if (text.trim()) {
            setText(text);
            setTarget('text');
          }
        }}>
        <div
          style={{
            position: 'relative',
            margin: '0 auto',
            width: cssWidth,
            padding: BEZEL,
            borderRadius: radius + BEZEL,
            background: '#0D0F12',
            boxShadow: `0 0 0 1px ${fileDragging ? theme.accent : theme.border}, 0 10px 28px rgba(0,0,0,0.28)`,
          }}>
          <canvas
            ref={canvasRef}
            aria-label="Projector stage. Drag to move, scroll or pinch to zoom."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              display: 'block',
              width: cssWidth,
              height: cssHeight,
              borderRadius: radius,
              touchAction: 'none',
              cursor: hasContent ? 'grab' : 'default',
              background: scene.background,
            }}
          />
          {!hasContent || fileDragging ? (
            <div
              style={{
                position: 'absolute',
                inset: BEZEL,
                borderRadius: radius,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: 16,
                textAlign: 'center',
                pointerEvents: 'none',
                color: scene.background === '#FFFFFF' ? '#5C6470' : '#A7B0BC',
                border: fileDragging ? `2px dashed ${theme.accent}` : 'none',
              }}>
              <div style={{ fontWeight: 600 }}>{fileDragging ? 'Release to place on the Projector' : 'Projector screen'}</div>
              {!fileDragging ? (
                <div style={{ fontSize: 12 }}>Drop or paste an image, choose one below, or type text.</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Image */}
      <div style={row}>
        <span style={label}>Image</span>
        <button type="button" style={button()} onClick={() => fileInputRef.current?.click()}>Choose…</button>
        <button
          type="button"
          style={button(false, !captureDataUrl)}
          disabled={!captureDataUrl}
          onClick={() => captureDataUrl && loadImage(captureDataUrl)}>
          Use capture
        </button>
        <button type="button" style={button(false, !scene.image)} disabled={!scene.image} onClick={fitImage}>Fit</button>
        <button type="button" style={button(false, !scene.image)} disabled={!scene.image} onClick={fillImage}>Fill</button>
        <button type="button" style={button(false, !scene.image)} disabled={!scene.image} onClick={rotateImage}>↻ 90°</button>
        <button
          type="button"
          style={button(false, !scene.image, theme.danger)}
          disabled={!scene.image}
          onClick={removeImage}>
          Remove
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            readFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {scene.image ? (
        <div style={row}>
          <span style={label}>Zoom</span>
          <input
            type="range"
            min={Math.log(MIN_IMAGE_SCALE)}
            max={Math.log(MAX_IMAGE_SCALE)}
            step={0.01}
            value={imageZoomLog}
            onChange={(event) => {
              const scale = Math.exp(Number(event.target.value));
              setScene((s) => (s.image ? { ...s, image: { ...s.image, scale } } : s));
            }}
            style={{ flex: 1, minWidth: 120 }}
          />
          <span style={{ fontSize: 12, color: theme.textSecondary, width: 44 }}>
            {Math.round((scene.image.scale ?? 1) * 100)}%
          </span>
        </div>
      ) : null}

      {/* Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>Text</span>
        <textarea
          value={scene.text?.text ?? ''}
          onChange={(event) => {
            setText(event.target.value);
            setTarget('text');
          }}
          placeholder="Type or paste text to show on the Projector…"
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: 8,
            background: theme.background,
            color: theme.text,
            font: scene.text?.mono ? '13px ui-monospace, Menlo, Consolas, monospace' : 'inherit',
            resize: 'vertical',
          }}
        />
        {scene.text ? (
          <div style={row}>
            <input
              type="range"
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              step={0.0025}
              value={scene.text.size}
              onChange={(event) => {
                const size = Number(event.target.value);
                setScene((s) => (s.text ? { ...s, text: { ...s.text, size } } : s));
              }}
              style={{ flex: 1, minWidth: 100 }}
              aria-label="Text size"
            />
            {TEXT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                style={button(scene.text?.color === color.value)}
                onClick={() => setScene((s) => (s.text ? { ...s, text: { ...s.text, color: color.value } } : s))}>
                {color.label}
              </button>
            ))}
            <button
              type="button"
              style={button(scene.text.mono)}
              onClick={() => setScene((s) => (s.text ? { ...s, text: { ...s.text, mono: !s.text.mono } } : s))}>
              Code font
            </button>
            <button type="button" style={button(false, false, theme.danger)} onClick={removeText}>Remove</button>
          </div>
        ) : null}
      </div>

      {/* Frame */}
      <div style={row}>
        <span style={label}>Shape</span>
        {SHAPES.map((option) => (
          <button
            key={option.value}
            type="button"
            style={button(shape === option.value)}
            onClick={() => setShape(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      <div style={row}>
        <span style={label}>Direction</span>
        <button type="button" style={button(rotated)} onClick={() => setRotated((value) => !value)}>
          ↻ {aspect < 1 ? 'Portrait' : aspect > 1 ? 'Landscape' : 'Square'}
        </button>
        <span style={{ ...label, minWidth: 0, marginLeft: 8 }}>Background</span>
        <button
          type="button"
          style={button(scene.background === '#000000')}
          onClick={() => setScene((s) => ({ ...s, background: '#000000' }))}>
          Black
        </button>
        <button
          type="button"
          style={button(scene.background === '#FFFFFF')}
          onClick={() => setScene((s) => ({ ...s, background: '#FFFFFF' }))}>
          White
        </button>
      </div>
      <div style={row}>
        <span style={label}>Drag moves</span>
        <button
          type="button"
          style={button(target === 'image', !scene.image)}
          disabled={!scene.image}
          onClick={() => setTarget('image')}>
          Image
        </button>
        <button
          type="button"
          style={button(target === 'text', !scene.text)}
          disabled={!scene.text}
          onClick={() => setTarget('text')}>
          Text
        </button>
      </div>

      {/* Send */}
      <div style={{ ...row, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
          Live
        </label>
        <button
          type="button"
          style={{
            ...button(false, !projectorReady || !hasContent),
            background: theme.accent,
            color: theme.accentText,
            border: `1px solid ${theme.accent}`,
            fontWeight: 600,
          }}
          disabled={!projectorReady || !hasContent}
          onClick={sendNow}>
          {status ?? 'Send now'}
        </button>
        <button type="button" style={button(false, false, theme.danger)} onClick={clearScreen}>
          Clear screen
        </button>
      </div>
      {!projectorReady ? (
        <div style={{ fontSize: 12, color: theme.textSecondary }}>
          Connect the Projector to this session to show the stage full-screen on it.
        </div>
      ) : null}
    </div>
  );
}
