import type { ReactNode } from 'react';

import { AccessGate } from '@/components/access-gate';
import { useSessionStore } from '@/store/session';

/**
 * Prevents deep links and direct URLs from rendering role screens before the
 * access key is accepted. The home route renders the same gate inline.
 */
export function AccessBoundary({ children }: { children: ReactNode }) {
  const isUnlocked = useSessionStore((state) => state.isUnlocked);

  if (!isUnlocked) {
    return <AccessGate />;
  }

  return <>{children}</>;
}
