import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type VideoViewProps = {
  stream: MediaStream | null;
  placeholder?: string;
  onVideoElement?: (el: null) => void;
};

/** Native video rendering will be added with the react-native-webrtc integration. */
export function VideoView({ placeholder = 'Video preview is available in the web build.' }: VideoViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <ThemedText type="small" themeColor="textSecondary">
          {placeholder}
        </ThemedText>
      </View>
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
