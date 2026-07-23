export type FocusSessionStatus = 'running' | 'paused' | 'awaiting-confirmation';

export interface ActiveFocusSession {
  readonly id: string;
  readonly targetMs: number;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly status: FocusSessionStatus;
  readonly pausedAt: number | null;
  readonly totalPausedMs: number;
  readonly midpointNudged: boolean;
  readonly allowPause: boolean;
  readonly midpointNudgeEnabled: boolean;
}

export interface CompletedFocusSession {
  readonly id: string;
  readonly targetMs: number;
  readonly creditedMs: number;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly totalPausedMs: number;
  readonly outcome?: 'completed' | 'ended-early';
}

export type CompletedFocusSessionList = CompletedFocusSession[];
