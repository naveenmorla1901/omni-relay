import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessGate } from '@/components/access-gate';
import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Role } from '@/protocol/messages';
import { useSessionStore } from '@/store/session';

const ROLES: {
  role: Role;
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  href: '/recorder' | '/admin' | '/projector';
}[] = [
  {
    role: 'recorder',
    badge: 'R',
    title: 'Recorder',
    description: 'Point a phone camera at a screen or page and send clean, legible frames.',
    bullets: ['Lock exposure, focus, and white balance', 'Detect and rectify the screen region', 'Stream 1080p+ at a deliberately low FPS'],
    href: '/recorder',
  },
  {
    role: 'admin',
    badge: 'A',
    title: 'Admin',
    description: 'Watch the live feed, freeze a full-resolution still, then push it onward.',
    bullets: ['Live low-FPS preview', 'Full-resolution capture gallery', 'Crop, enhance, OCR, and send'],
    href: '/admin',
  },
  {
    role: 'display',
    badge: 'P',
    title: 'Projector',
    description: 'Receive images or code from Admin and show them full-screen on any display.',
    bullets: ['Image contain/cover rendering', 'Syntax-highlighted code', 'Keeps the last item until the next push'],
    href: '/projector',
  },
];

export default function RolePickerScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const setActiveRole = useSessionStore((state) => state.setActiveRole);
  const isUnlocked = useSessionStore((state) => state.isUnlocked);
  const lock = useSessionStore((state) => state.lock);
  const wide = width >= 920;

  if (!isUnlocked) {
    return <AccessGate />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={[styles.eyebrow, { borderColor: theme.border }]}>
                <ThemedText type="code" themeColor="textSecondary">
                  P2P · WEBRTC · NO CLOUD
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={lock}
                style={({ pressed }) => [
                  styles.lockButton,
                  {
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Lock session
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.wordmark}>ClearRelay</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.tagline}>
              Direct device-to-device relay built around one rule: never trade text clarity for
              smooth motion.
            </ThemedText>
          </View>

          <View style={[styles.grid, wide && styles.gridWide]}>
            {ROLES.map((role) => (
              <RoleCard
                key={role.role}
                {...role}
                onPress={() => setActiveRole(role.role)}
              />
            ))}
          </View>

          <View style={[styles.footer, { borderColor: theme.border }]}>
            <View style={styles.footerCopy}>
              <ThemedText type="smallBold">Pairing</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Choose QR (serverless) or a room code via the optional signaling helper.
              </ThemedText>
            </View>
            <Link href="/pair" asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.pairButton,
                  {
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="smallBold">Pairing setup →</ThemedText>
              </Pressable>
            </Link>
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
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  header: {
    gap: Spacing.three,
    maxWidth: 760,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  lockButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  wordmark: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 640,
  },
  grid: {
    gap: Spacing.three,
  },
  gridWide: {
    flexDirection: 'row',
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.four,
    gap: Spacing.three,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerCopy: {
    gap: Spacing.one,
    flexShrink: 1,
    maxWidth: 560,
  },
  pairButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
