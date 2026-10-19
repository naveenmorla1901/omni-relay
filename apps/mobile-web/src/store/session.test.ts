import { beforeEach, describe, expect, it } from 'vitest';

import { ACCESS_KEY, ACCESS_KEYS } from '@/config';
import { useSessionStore } from '@/store/session';

describe('session access gate', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('unlocks with the built-in key', () => {
    expect(ACCESS_KEYS).toContain(ACCESS_KEY);
    expect(useSessionStore.getState().unlockWithKey(ACCESS_KEY)).toBe(true);
    expect(useSessionStore.getState().isUnlocked).toBe(true);
  });

  it('rejects an unknown key and stays locked', () => {
    expect(useSessionStore.getState().unlockWithKey('not-a-configured-key')).toBe(false);
    expect(useSessionStore.getState().isUnlocked).toBe(false);
  });

  it('lock clears access and the active role', () => {
    useSessionStore.getState().unlockWithKey(ACCESS_KEY);
    useSessionStore.getState().setActiveRole('recorder');
    useSessionStore.getState().lock();

    expect(useSessionStore.getState().isUnlocked).toBe(false);
    expect(useSessionStore.getState().activeRole).toBeNull();
  });
});
