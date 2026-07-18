export type Panel = 'lyrics' | 'notes' | 'flashcards' | 'outline';

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type SleepPresetKey = 'off' | 'eoe' | 5 | 10 | 15 | 30 | 45 | 60;
/** 睡眠定时：关闭 / 倒计时分钟 / 播完本集 */
export type SleepState =
  | { kind: 'off' }
  | { kind: 'timer'; minutes: number; endsAt: number }
  | { kind: 'eoe' };

export const SLEEP_PRESETS: Array<{ key: SleepPresetKey; n?: number }> = [
  { key: 'off' },
  { key: 'eoe' },
  { key: 5, n: 5 },
  { key: 10, n: 10 },
  { key: 15, n: 15 },
  { key: 30, n: 30 },
  { key: 45, n: 45 },
  { key: 60, n: 60 },
];

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

