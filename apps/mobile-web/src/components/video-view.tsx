import { StyleSheet, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';

import { ThemedText } from '@/components/themed-text';

type VideoViewProps = {
  stream: MediaStream | null;
  placeholder?: string;
  mirror?: boolean;
  onVideoElement?: (el: null) => void;
  /** Clockwise display rotation; native Admin is not the capture path, so a plain turn is enough. */
  rotation?: 0 | 90 | 180 | 270;
};

export function VideoView({ stream, placeholder = 'Starting camera…', mirror = false, rotation = 0 }: VideoViewProps) {
  const streamURL = stream ? (stream as unknown as { toURL(): string }).toURL() : null;
  return (
    <View style={styles.container}>
      {streamURL ? (
        <RTCView
          streamURL={streamURL}
          style={[styles.video, rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null]}
          objectFit="contain"
          mirror={mirror}
          zOrder={0}
        />
      ) : (
        <View style={styles.placeholder}>
          <ThemedText type="small" themeColor="textSecondary">{placeholder}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 240, overflow: 'hidden', backgroundColor: '#05070A' },
  video: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
