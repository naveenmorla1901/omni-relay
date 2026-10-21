import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type VideoViewProps = {
  stream: MediaStream | null;
  placeholder?: string;
  /** Keep remote preview orientation in sync with the Recorder when requested. */
  mirror?: boolean;
  /** Called with the underlying <video> element (or null on unmount). Lets callers capture frames. */
  onVideoElement?: (el: HTMLVideoElement | null) => void;
  /** Clockwise display rotation, for a Recorder phone held sideways. */
  rotation?: 0 | 90 | 180 | 270;
};

export function VideoView({
  stream,
  placeholder = 'No video yet',
  mirror = false,
  onVideoElement,
  rotation = 0,
}: VideoViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stream]);

  // A quarter turn swaps the video's box so the rotated picture still fits.
  const sideways = rotation === 90 || rotation === 270;
  const videoWidth = sideways && box ? box.h : box?.w;
  const videoHeight = sideways && box ? box.w : box?.h;

  const setRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    onVideoElement?.(el);
  }, [onVideoElement]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    if (stream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  // Notify parent when the element unmounts.
  useEffect(() => {
    return () => onVideoElement?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {stream ? (
        <div ref={boxRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <video
            ref={setRef}
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: videoWidth ?? '100%',
              height: videoHeight ?? '100%',
              objectFit: 'contain',
              backgroundColor: '#05070A',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)${mirror ? ' scaleX(-1)' : ''}`,
            }}
          />
        </div>
      ) : (
        <View style={styles.placeholder}>
          <ThemedText type="small" themeColor="textSecondary">
            {placeholder}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    overflow: 'hidden',
    backgroundColor: '#05070A',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
