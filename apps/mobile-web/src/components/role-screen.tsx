import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Role } from '@/protocol/messages';

type RoleScreenProps = {
  role: Role;
  roleLabel?: string;
  title: string;
  summary: string;
  bullets: string[];
  nextMilestone: string;
};

export function RoleScreen({
  role,
  roleLabel,
  title,
  summary,
  bullets,
  nextMilestone,
}: RoleScreenProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="button" hitSlop={12} style={styles.back}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                ← All roles
              </ThemedText>
            </Pressable>
          </Link>

          <View style={styles.header}>
            <View style={[styles.roleTag, { borderColor: theme.border }]}>
              <ThemedText type="code" themeColor="textSecondary">
                {roleLabel ?? role}
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              {title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.summary}>
              {summary}
            </ThemedText>
          </View>

          <View
            style={[
              styles.panel,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <ThemedText type="smallBold">What lands here</ThemedText>
            {bullets.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.bullet}>
                  {bullet}
                </ThemedText>
              </View>
            ))}
          </View>

          <View style={[styles.notice, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              M0 scaffold
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {nextMilestone}
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  back: {
    alignSelf: 'flex-start',
  },
  header: {
    gap: Spacing.three,
  },
  roleTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
  },
  summary: {
    maxWidth: 680,
    fontSize: 18,
    lineHeight: 28,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bullet: {
    flex: 1,
  },
  notice: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
});
