import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type RoleCardProps = {
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  href: Href;
  onPress?: () => void;
};

export function RoleCard({ badge, title, description, bullets, href, onPress }: RoleCardProps) {
  const theme = useTheme();

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
            borderColor: pressed ? theme.accent : theme.border,
          },
        ]}>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            {badge}
          </ThemedText>
        </View>

        <ThemedText type="subtitle" style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>

        <View style={styles.bullets}>
          {bullets.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <View style={[styles.dot, { backgroundColor: theme.accent }]} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
                {bullet}
              </ThemedText>
            </View>
          ))}
        </View>

        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Open {title} →
        </ThemedText>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 260,
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  bullets: {
    gap: Spacing.two,
    flexGrow: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
  },
});
