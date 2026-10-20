import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  onImage: (dataUrl: string) => void;
  onCode: (text: string) => void;
};

/**
 * Web-only manual input for the Projector: drag & drop an image from the file
 * manager, choose a file, or paste an image/code with Ctrl+V. Nothing is
 * uploaded; the content stays in this browser tab.
 */
export function ProjectorDropZone({ onImage, onCode }: Props) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = useCallback(
    (file: File | null | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') onImage(reader.result);
      };
      reader.readAsDataURL(file);
    },
    [onImage],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // Never hijack a paste into the room-code field or any other text input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              readFile(file);
              return;
            }
          }
        }
      }

      const text = event.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        event.preventDefault();
        onCode(text);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onCode, readFile]);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        readFile(event.dataTransfer.files?.[0]);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        border: `1px dashed ${dragging ? theme.accent : theme.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        backgroundColor: dragging ? 'rgba(0,122,255,0.08)' : theme.background,
        color: theme.textSecondary,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        textAlign: 'center',
      }}>
      <div style={{ fontWeight: 600, color: theme.text }}>
        Drop an image here, or paste an image/code (Ctrl+V)
      </div>
      <div>Drag a screenshot or photo from your files. Pasted text appears as code.</div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: '8px 14px',
          background: theme.backgroundElement,
          color: theme.text,
          cursor: 'pointer',
          font: 'inherit',
        }}>
        Choose image…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          readFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {dragging ? (
        <div style={{ color: theme.accent, fontWeight: 600 }}>Release to project</div>
      ) : null}
    </div>
  );
}
