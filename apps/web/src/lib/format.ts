export function formatSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** 稳定哈希：封面色 / 纹理变体共用 */
export function hashSeed(seed?: string): number {
  const key = seed || 'default';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * 播客封面色板：亮色主推 + 深色质感混搭
 * 与服务端 pickGradient 保持同步
 */
export const COVER_PALETTE = [
  'from-[#7eb0ff] via-[#4f8ef7] to-[#3b7aef]',
  'from-[#a5b4fc] via-[#818cf8] to-[#4f46e5]',
  'from-[#5eead4] via-[#14b8a6] to-[#0f766e]',
  'from-[#f9a8d4] via-[#f472b6] to-[#db2777]',
  'from-[#fbbf24] via-[#f59e0b] to-[#d97706]',
  'from-[#c4b5fd] via-[#8b5cf6] to-[#6d28d9]',
  'from-[#7dd3fc] via-[#38bdf8] to-[#0284c7]',
  'from-[#fca5a5] via-[#f87171] to-[#dc2626]',
  'from-[#1a1a2e] via-[#16213e] to-[#0f3460]',
  'from-[#2b1055] via-[#7597de] to-[#1b1b2f]',
  'from-[#0f2027] via-[#203a43] to-[#2c5364]',
  'from-[#3a1c71] via-[#d76d77] to-[#ffaf7b]',
] as const;

/** Tailwind gradient class for covers */
export function gradientClass(g?: string): string {
  return g || COVER_PALETTE[0];
}

/** 根据 id/title 稳定分配封面色，避免列表单调 */
export function coverGradientFor(seed?: string, preferred?: string): string {
  if (preferred?.includes('from-')) return preferred;
  return COVER_PALETTE[hashSeed(seed) % COVER_PALETTE.length];
}

/** 封面纹理变体 0-3 */
export function motifIndexFor(seed?: string): number {
  return hashSeed(seed) % 4;
}

/** 封面 monogram：取首个中文/字母/数字 */
export function monogramFrom(text?: string): string {
  if (!text) return '播';
  const cleaned = text
    .replace(/[【】\[\]（）()《》「」『』·•|,./\\#@!$%^&*_+=~`'"<>?:;]/g, '')
    .trim();
  const match = cleaned.match(/[\u4e00-\u9fffA-Za-z0-9]/);
  if (!match) return '播';
  const ch = match[0];
  return /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
}

export function listenProgressPct(
  progressSec?: number,
  durationSec?: number,
): number {
  if (!progressSec || !durationSec || durationSec <= 0) return 0;
  return Math.max(0, Math.min(100, (progressSec / durationSec) * 100));
}
