import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessBoundary } from '@/components/access-boundary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SignalingMode } from '@/protocol/messages';
import { useSessionStore } from '@/store/session';

const MODES: { mode: SignalingMode; title: string; description: string; note: string }[] = [
  {
    mode: 'qr',
    title: 'QR / manual',
    description: 'Exchange a compressed SDP offer and answer as QR codes. No server involved.',
    note: 'Default · zero infrastructure',
  },
  {
    mode: 'ws',
    title: 'Room code',
    description: 'A tiny WebSocket helper forwards signaling only; media still travels peer-to-peer.',
    note: 'Optional · helper arrives in M8',
  },
];

export default function PairScreen() {
  return (
    <AccessBoundary>
      <PairWorkspace />
    </AccessBoundary>
  );
}

function PairWorkspace() {
  const theme = useTheme();
  const signalingMode = useSessionStore((state) => state.signalingMode);
  const setSignalingMode = useSessionStore((state) => state.setSignalingMode);

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
            <ThemedText type="title" style={styles.title}>
              Pairing
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.summary}>
              Pick how two devices exchange their WebRTC offer, answer, and ICE candidates. This
              choice is stored for the session only.
            </ThemedText>
          </View>

          <View style={styles.modes}>
            {MODES.map((mode) => {
              const selected = signalingMode === mode.mode;
              return (
                <Pressable
                  key={mode.mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSignalingMode(mode.mode)}
                  style={[
                    styles.modeCard,
                    {
                      backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}>
                  <View style={styles.modeHeader}>
                    <ThemedText type="subtitle" style={styles.modeTitle}>
                      {mode.title}
                    </ThemedText>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selected ? theme.accent : theme.border,
                          backgroundColor: selected ? theme.accent : 'transparent',
                        },
                      ]}
                    />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {mode.description}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    {mode.note}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.notice, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              M0 scaffold
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              QR generation/scanning lands in M1. The room-code helper lands in M8 and must never
              forward media.
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
    maxWidth: 720,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
  },
  summary: {
    fontSize: 18,
    lineHeight: 28,
  },
  modes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  modeCard: {
    flex: 1,
    minWidth: 280,
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  modeTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  notice: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
});
