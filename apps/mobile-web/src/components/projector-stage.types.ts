import type { Viewport } from '@/lib/stage';

export type ProjectorStageProps = {
  /** Projector screen; null until it reports (a typical phone is assumed). */
  viewport: Viewport | null;
  projectorReady: boolean;
  /** Admin's selected capture, offered as a one-click image source. */
  captureDataUrl: string | null;
  /** Send a rendered frame; returns its id, or null when nothing was sent. */
  onFrame: (dataUrl: string, width: number, height: number) => string | null;
  onClear: () => void;
  /** Changes whenever the Projector (re)joins, so the current frame is resent. */
  resendToken: number;
  /** Id of the last frame the Projector confirmed on screen. */
  lastAckId: string | null;
  /** Tallest the phone preview may be, in CSS px. */
  maxPreviewHeight?: number;
};
