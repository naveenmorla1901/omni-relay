import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = {
  onImage: (dataUrl: string) => void;
  onCode: (text: string) => void;
};

/** Native fallback: drag & drop and clipboard paste are browser features. */
export function ProjectorDropZone({ onImage, onCode }: Props) {
  void onImage;
  void onCode;

  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Local input</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Drag & drop and paste are available in the web Projector. Open this session in a browser to use them.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
