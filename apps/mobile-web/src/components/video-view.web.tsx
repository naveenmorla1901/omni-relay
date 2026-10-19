import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type VideoViewProps = {
  stream: MediaStream | null;
  placeholder?: string;
  /** Called with the underlying <video> element (or null on unmount). Lets callers capture frames. */
  onVideoElement?: (el: HTMLVideoElement | null) => void;
};

export function VideoView({ stream, placeholder = 'No video yet', onVideoElement }: VideoViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const setRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    onVideoElement?.(el);
  };

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
        <video
          ref={setRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#05070A',
          }}
        />
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
