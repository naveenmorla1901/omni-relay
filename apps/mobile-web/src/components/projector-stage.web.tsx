import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';

import { APP_BUILD, CONFIG } from '@/config';
import { useTheme } from '@/hooks/use-theme';
import {
  clamp,
  createImageLayer,
  createTextLayer,
  DEFAULT_VIEWPORT,
  EMPTY_SCENE,
  fillScaleFactor,
  hitImage,
  imageRect,
  layoutText,
  MAX_IMAGE_SCALE,
  MAX_TEXT_SIZE,
  MIN_IMAGE_SCALE,
  MIN_TEXT_SIZE,
  renderStage,
  stageAspect,
  stageFont,
  stageOutputSize,
  zoomImageAt,
} from '@/lib/stage';
import type { ImageRotation, StageScene, StageTextLayer } from '@/lib/stage';

import type { ProjectorStageProps } from './projector-stage.types';

type DragTarget = 'image' | 'text';

/** Phone body around the screen, in CSS px. */
const BEZEL = 12;
const TEXT_COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#000000', label: 'Black' },
  { value: '#FFD60A', label: 'Yellow' },
];
const ZOOM_STEP = 1.25;

/**
 * Admin's phone-shaped Projector stage. Whatever is inside the phone screen is
 * rendered at the Projector's physical resolution and shown there full-screen,
 * live: every settled edit is sent, there is no Send button.
 */
export function ProjectorStage({
  viewport,
  projectorReady,
  captureDataUrl,
  onFrame,
  onClear,
  resendToken,
  lastAckId,
  maxPreviewHeight = CONFIG.STAGE_PREVIEW_MAX_HEIGHT,
}: ProjectorStageProps) {
  const theme = useTheme();
  const [scene, setScene] = useState<StageScene>(EMPTY_SCENE);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [rotated, setRotated] = useState(false);
  const [target, setTarget] = useState<DragTarget>('image');
  const [fileDragging, setFileDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [ackLate, setAckLate] = useState(false);
  const [containerWidth, setContainerWidth] = useState(320);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; value: number } | null>(null);
  const sentEmptyRef = useRef(true);
  const sceneRef = useRef(scene);
  const targetRef = useRef(target);
  useEffect(() => {
    sceneRef.current = scene;
    targetRef.current = target;
  }, [scene, target]);

  const vp = viewport ?? DEFAULT_VIEWPORT;
  const aspect = stageAspect(vp, 'projector', rotated);
  const outputSize = stageOutputSize(vp, aspect, CONFIG.STAGE_MAX_LONG_SIDE);
  const hasText = Boolean(scene.text && scene.text.text.trim() !== '');
  const hasContent = Boolean(scene.image || hasText);

  // Fit the phone inside the pane width and the available height.
  let cssWidth = Math.max(120, Math.min(containerWidth, 440) - BEZEL * 2);
  let cssHeight = cssWidth / aspect;
  const heightCap = Math.max(240, maxPreviewHeight);
  if (cssHeight > heightCap) {
    cssHeight = heightCap;
    cssWidth = cssHeight * aspect;
  }
  cssWidth = Math.round(cssWidth);
  cssHeight = Math.round(cssHeight);
  const shortSide = Math.min(cssWidth, cssHeight);
  const radius = Math.round(shortSide * 0.12);

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

  const flash = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 3500);
  }, []);

  // ── Content sources ──────────────────────────────────────────────────────

  const loadImage = useCallback((src: string) => {
    const img = new window.Image();
    img.onload = () => {
      setImageEl(img);
      setScene((s) => ({ ...s, image: createImageLayer(src, img.naturalWidth, img.naturalHeight) }));
      setTarget('image');
    };
    img.onerror = () => flash('That image could not be opened here. Try a JPEG or PNG.');
    img.src = src;
  }, [flash]);

  const readFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      flash(`${file.name || 'That file'} is not an image.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') loadImage(reader.result);
    };
    reader.readAsDataURL(file);
  }, [flash, loadImage]);

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
    if (!ctx) return;
    renderStage(ctx, scene, imageEl, canvas.width, canvas.height);
    // Editor-only outline of the layer that drag/zoom will move.
    const outline = selectionBox(ctx, scene, target, canvas.width, canvas.height);
    if (outline) {
      ctx.save();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = Math.max(1, dpr * 1.5);
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.translate(outline.cx, outline.cy);
      ctx.rotate(outline.angle);
      ctx.strokeRect(-outline.w / 2, -outline.h / 2, outline.w, outline.h);
      ctx.restore();
    }
  }, [cssHeight, cssWidth, imageEl, scene, target, theme.accent]);

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

  // Always live: every settled edit (and every Projector rejoin) goes out.
  useEffect(() => {
    if (!projectorReady) return;
    const timer = setTimeout(() => {
      if (!hasContent) {
        if (!sentEmptyRef.current) onClear();
        sentEmptyRef.current = true;
        setSentId(null);
        return;
      }
      const out = renderOutput();
      if (!out) return;
      const id = onFrame(out.dataUrl, out.width, out.height);
      if (id) {
        sentEmptyRef.current = false;
        setSentId(id);
        setAckLate(false);
      }
    }, CONFIG.STAGE_SEND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hasContent, onClear, onFrame, projectorReady, renderOutput, resendToken]);

  // A re-joined Projector starts blank, so forget what we think it shows.
  useEffect(() => {
    sentEmptyRef.current = true;
  }, [resendToken]);

  const confirmed = sentId !== null && lastAckId === sentId;
  useEffect(() => {
    if (!sentId || confirmed) return;
    const timer = setTimeout(() => setAckLate(true), CONFIG.STAGE_ACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirmed, sentId]);

  const clearScreen = useCallback(() => {
    setScene((s) => ({ ...EMPTY_SCENE, background: s.background }));
    setImageEl(null);
    setTarget('image');
  }, []);

  // ── Direct manipulation ─────────────────────────────────────────────────

  /** Pointer position as a fraction of the stage. */
  const stagePoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { fx: 0.5, fy: 0.5 };
    return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
  };

  /** Text wins when the pointer is on it; otherwise the image. */
  const pickTarget = (fx: number, fy: number): DragTarget | null => {
    const s = sceneRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas && s.text && s.text.text.trim() !== '') {
      const box = textBox(ctx, s.text, canvas.width, canvas.height);
      const px = fx * canvas.width;
      const py = fy * canvas.height;
      const pad = canvas.width * 0.02;
      if (px >= box.x - pad && px <= box.x + box.w + pad && py >= box.y - pad && py <= box.y + box.h + pad) {
        return 'text';
      }
    }
    if (s.image && canvas && hitImage(s.image, canvas.width, canvas.height, fx * canvas.width, fy * canvas.height)) {
      return 'image';
    }
    return s.image ? 'image' : s.text ? 'text' : null;
  };

  const moveBy = useCallback((layer: DragTarget, dx: number, dy: number) => {
    setScene((s) => {
      if (layer === 'image' && s.image) {
        return {
          ...s,
          image: { ...s.image, cx: clamp(s.image.cx + dx, -0.5, 1.5), cy: clamp(s.image.cy + dy, -0.5, 1.5) },
        };
      }
      if (layer === 'text' && s.text) {
        return { ...s, text: { ...s.text, x: clamp(s.text.x + dx, 0, 0.9), y: clamp(s.text.y + dy, 0, 0.95) } };
      }
      return s;
    });
  }, []);

  /** Zoom the image toward a stage point, or resize the text. */
  const zoomLayer = useCallback((layer: DragTarget, value: number, fx = 0.5, fy = 0.5) => {
    setScene((s) => {
      if (layer === 'image' && s.image) return { ...s, image: zoomImageAt(s.image, value, fx, fy) };
      if (layer === 'text' && s.text) {
        return { ...s, text: { ...s.text, size: clamp(value, MIN_TEXT_SIZE, MAX_TEXT_SIZE) } };
      }
      return s;
    });
  }, []);

  const zoomValue = (layer: DragTarget) => {
    const s = sceneRef.current;
    return layer === 'image' ? s.image?.scale ?? 1 : s.text?.size ?? MIN_TEXT_SIZE;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const s = sceneRef.current;
      if (!s.image && !s.text) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      const layer: DragTarget = targetRef.current === 'text' && s.text ? 'text' : s.image ? 'image' : 'text';
      const current = layer === 'image' ? s.image?.scale ?? 1 : s.text?.size ?? MIN_TEXT_SIZE;
      zoomLayer(layer, current * Math.exp(-event.deltaY * 0.0015), fx, fy);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomLayer]);

  const pointerPair = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    return a && b ? { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const { fx, fy } = stagePoint(event.clientX, event.clientY);
      const picked = pickTarget(fx, fy);
      if (picked) setTarget(picked);
    } else if (pointersRef.current.size === 2) {
      const pair = pointerPair();
      if (pair) pinchRef.current = { distance: pair.distance, value: zoomValue(target) };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const pair = pointerPair();
      if (pair && pinch.distance > 0) {
        const { fx, fy } = stagePoint(pair.x, pair.y);
        zoomLayer(target, pinch.value * (pair.distance / pinch.distance), fx, fy);
      }
      return;
    }
    moveBy(target, (event.clientX - previous.x) / cssWidth, (event.clientY - previous.y) / cssHeight);
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

  const centerImage = () =>
    setScene((s) => (s.image ? { ...s, image: { ...s.image, cx: 0.5, cy: 0.5 } } : s));

  const toggleFitFill = () => {
    const image = sceneRef.current.image;
    if (!image) return;
    if (Math.abs(image.scale - 1) < 0.01 && image.cx === 0.5 && image.cy === 0.5) fillImage();
    else fitImage();
  };

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

  const openFilePicker = () => fileInputRef.current?.click();

  // ── Drag and drop anywhere on the stage panel ───────────────────────────

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setFileDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
      return;
    }
    const uri = event.dataTransfer.getData('text/uri-list');
    if (uri && /^(https?:|data:image\/)/.test(uri)) {
      void loadRemoteImage(uri).then(loadImage, () =>
        flash('That website does not allow copying its image. Save it, then drop the file.'),
      );
      return;
    }
    const text = event.dataTransfer.getData('text/plain');
    if (text.trim()) {
      setText(text);
      setTarget('text');
    }
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
    whiteSpace: 'nowrap',
  });
  const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
  const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: theme.textSecondary, minWidth: 52 };
  const imageScale = scene.image?.scale ?? 1;
  const portraitFrame = cssHeight >= cssWidth;

  const status = !projectorReady
    ? { color: theme.textSecondary, text: 'Projector not connected — enter the session code on your phone.' }
    : !hasContent
      ? { color: theme.success, text: 'Live · Projector is blank. Add an image or type text.' }
      : confirmed
        ? { color: theme.success, text: 'Live · showing on the Projector' }
        : ackLate
          ? { color: theme.danger, text: `The Projector has not confirmed. Check it shows ${APP_BUILD} in its tap menu and is still connected.` }
          : { color: theme.textSecondary, text: 'Live · sending…' };

  return (
    <div
      ref={containerRef}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setFileDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setFileDragging(false);
      }}
      onDrop={onDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: theme.text,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color, flex: 'none' }} />
        <span style={{ color: status.color === theme.textSecondary ? theme.textSecondary : status.color }}>{status.text}</span>
      </div>

      {/* Phone */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <div
          style={{
            position: 'relative',
            padding: BEZEL,
            borderRadius: radius + BEZEL,
            background: 'linear-gradient(145deg, #2A2E35, #0B0C0E 60%)',
            boxShadow: `0 0 0 ${fileDragging ? 2 : 1}px ${fileDragging ? theme.accent : '#3A3F47'}, 0 18px 40px rgba(0,0,0,0.35)`,
          }}>
          {/* Side buttons */}
          <PhoneButton side={portraitFrame ? 'right' : 'bottom'} offset={0.22} length={0.14} />
          <PhoneButton side={portraitFrame ? 'left' : 'top'} offset={0.18} length={0.08} />
          <PhoneButton side={portraitFrame ? 'left' : 'top'} offset={0.3} length={0.08} />
          <canvas
            ref={canvasRef}
            aria-label="Projector screen. Drag to move, scroll or pinch to zoom, double-click to switch Fit and Fill."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={toggleFitFill}
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
          {/* Camera cut-out */}
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              background: '#000',
              borderRadius: 999,
              ...(portraitFrame
                ? { top: BEZEL + shortSide * 0.035, left: '50%', width: shortSide * 0.27, height: shortSide * 0.075, transform: 'translateX(-50%)' }
                : { left: BEZEL + shortSide * 0.035, top: '50%', height: shortSide * 0.27, width: shortSide * 0.075, transform: 'translateY(-50%)' }),
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
                gap: 10,
                padding: 20,
                textAlign: 'center',
                pointerEvents: fileDragging ? 'none' : 'auto',
                color: scene.background === '#FFFFFF' ? '#5C6470' : '#A7B0BC',
                border: `2px dashed ${fileDragging ? theme.accent : 'rgba(167,176,188,0.35)'}`,
                background: fileDragging ? 'rgba(10,132,255,0.12)' : 'transparent',
              }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>⤓</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {fileDragging ? 'Drop to show it on the Projector' : 'Drop an image here'}
              </div>
              {!fileDragging ? (
                <>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    style={{ ...button(), background: theme.accent, color: theme.accentText, border: `1px solid ${theme.accent}`, fontWeight: 600 }}>
                    Choose from files
                  </button>
                  <div style={{ fontSize: 12 }}>or paste with Ctrl+V · or type text below</div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {notice ? <div style={{ fontSize: 12, color: theme.danger }}>{notice}</div> : null}

      {/* Image editor */}
      <div style={row}>
        <span style={label}>Image</span>
        <button type="button" style={button()} onClick={openFilePicker}>
          {scene.image ? 'Replace…' : 'Choose…'}
        </button>
        <button
          type="button"
          style={button(false, !captureDataUrl)}
          disabled={!captureDataUrl}
          onClick={() => captureDataUrl && loadImage(captureDataUrl)}>
          Use selected capture
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
        <>
          <div style={row}>
            <span style={label}>Zoom</span>
            <button
              type="button"
              aria-label="Zoom out"
              style={button()}
              onClick={() => zoomLayer('image', imageScale / ZOOM_STEP)}>
              −
            </button>
            <input
              type="range"
              aria-label="Image zoom"
              min={Math.log(MIN_IMAGE_SCALE)}
              max={Math.log(MAX_IMAGE_SCALE)}
              step={0.01}
              value={Math.log(imageScale)}
              onChange={(event) => zoomLayer('image', Math.exp(Number(event.target.value)))}
              style={{ flex: 1, minWidth: 90 }}
            />
            <button
              type="button"
              aria-label="Zoom in"
              style={button()}
              onClick={() => zoomLayer('image', imageScale * ZOOM_STEP)}>
              +
            </button>
            <span style={{ fontSize: 12, color: theme.textSecondary, width: 42, textAlign: 'right' }}>
              {Math.round(imageScale * 100)}%
            </span>
          </div>
          <div style={row}>
            <span style={label}>Shape</span>
            <button type="button" style={button()} onClick={fitImage} title="Whole image visible">Fit</button>
            <button type="button" style={button()} onClick={fillImage} title="Fill the phone screen, no bars">Fill</button>
            <button type="button" style={button()} onClick={centerImage}>Center</button>
            <button type="button" style={button()} onClick={rotateImage}>↻ 90°</button>
            <button type="button" style={button(false, false, theme.danger)} onClick={removeImage}>Remove</button>
          </div>
        </>
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
          placeholder="Type or paste text or code — it appears on the Projector as you type."
          rows={4}
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
            <span style={{ ...label, minWidth: 0 }}>Size</span>
            <input
              type="range"
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              step={0.0025}
              value={scene.text.size}
              onChange={(event) => zoomLayer('text', Number(event.target.value))}
              style={{ flex: 1, minWidth: 80 }}
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

      {/* Screen */}
      <div style={row}>
        <span style={label}>Screen</span>
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
        <button type="button" style={button(rotated)} onClick={() => setRotated((value) => !value)}>
          ⟳ {rotated ? 'Sideways' : 'Upright'}
        </button>
        <button
          type="button"
          style={{ ...button(false, !hasContent, theme.danger), marginLeft: 'auto' }}
          disabled={!hasContent}
          onClick={clearScreen}>
          Clear Projector
        </button>
      </div>

      <div style={{ fontSize: 12, color: theme.textSecondary }}>
        Drag to move · scroll or pinch to zoom · double-click switches Fit/Fill.
        {viewport ? ` Sends ${rotated ? outputSize.height : outputSize.width}×${rotated ? outputSize.width : outputSize.height} px.` : ''}
      </div>
    </div>
  );
}

function PhoneButton({ side, offset, length }: { side: 'left' | 'right' | 'top' | 'bottom'; offset: number; length: number }) {
  const vertical = side === 'left' || side === 'right';
  const style: CSSProperties = {
    position: 'absolute',
    background: '#2A2E35',
    borderRadius: 2,
    ...(vertical
      ? { top: `${offset * 100}%`, height: `${length * 100}%`, width: 3, [side]: -3 }
      : { left: `${offset * 100}%`, width: `${length * 100}%`, height: 3, [side]: -3 }),
  };
  return <div style={style} />;
}

function textBox(ctx: CanvasRenderingContext2D, layer: StageTextLayer, width: number, height: number) {
  ctx.save();
  ctx.font = stageFont(layer, width);
  const layout = layoutText(layer, width, height, (s) => ctx.measureText(s).width);
  ctx.restore();
  return { x: layout.left, y: layout.top, w: Math.max(layout.width, width * 0.05), h: layout.height };
}

/** Outline of the active layer in canvas pixels (centre, size, rotation). */
function selectionBox(
  ctx: CanvasRenderingContext2D,
  scene: StageScene,
  target: DragTarget,
  width: number,
  height: number,
) {
  // Only worth outlining when there are two layers to choose between.
  if (!scene.image || !scene.text || scene.text.text.trim() === '') return null;
  if (target === 'image') {
    const rect = imageRect(scene.image, width, height);
    return { cx: rect.cx, cy: rect.cy, w: rect.width, h: rect.height, angle: (rect.rotation * Math.PI) / 180 };
  }
  const box = textBox(ctx, scene.text, width, height);
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: box.w, h: box.h, angle: 0 };
}

/** Fetch a dropped web image as a data URL so the stage canvas stays exportable. */
async function loadRemoteImage(uri: string): Promise<string> {
  if (uri.startsWith('data:image/')) return uri;
  const response = await fetch(uri, { mode: 'cors' });
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('not an image');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
