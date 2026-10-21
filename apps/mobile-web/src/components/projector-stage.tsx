import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import type { ProjectorStageProps } from './projector-stage.types';

/** Native fallback: the stage editor renders with canvas, a browser feature. */
export function ProjectorStage(_props: ProjectorStageProps) {
  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Projector stage</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Composing the Projector screen is available in the web Admin. Open this session in a browser.
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
