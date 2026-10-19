import { create } from 'zustand';

import { ACCESS_KEYS } from '@/config';
import type { Role, SignalingMode } from '@/protocol/messages';

type SessionState = {
  isUnlocked: boolean;
  activeRole: Role | null;
  signalingMode: SignalingMode;
  unlockWithKey: (key: string) => boolean;
  lock: () => void;
  setActiveRole: (role: Role | null) => void;
  setSignalingMode: (mode: SignalingMode) => void;
  reset: () => void;
};

const initialState = {
  isUnlocked: false,
  activeRole: null,
  signalingMode: 'qr',
} satisfies Pick<SessionState, 'isUnlocked' | 'activeRole' | 'signalingMode'>;

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,
  unlockWithKey: (key) => {
    const normalized = key.trim();
    const accepted = normalized.length > 0 && ACCESS_KEYS.includes(normalized);

    if (accepted) {
      set({ isUnlocked: true });
    }

    return accepted;
  },
  lock: () => set({ isUnlocked: false, activeRole: null }),
  setActiveRole: (activeRole) => set({ activeRole }),
  setSignalingMode: (signalingMode) => set({ signalingMode }),
  reset: () => set(initialState),
}));
