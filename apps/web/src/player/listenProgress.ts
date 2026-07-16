import type { ListenRecord } from '../types/job';
import { reportProgress } from '../api/client';

const STORAGE_KEY = 'pb:listen-progress:v1';
const LAST_TRACK_KEY = 'pb:last-track:v1';

export type LocalListenProgress = {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed: boolean;
  updatedAt: number;
  playCount: number;
};

export type LastTrackSnapshot = {
  id: string;
  title: string;
  src: string;
  coverClassName?: string;
  coverImageUrl?: string;
  downloadUrl?: string;
  summary?: string;
  progressSec: number;
  durationSec: number;
  updatedAt: number;
};

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readMap(): Record<string, LocalListenProgress> {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalListenProgress>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, LocalListenProgress>): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / private mode
  }
}

export function getLocalProgress(jobId: string): LocalListenProgress | null {
  const row = readMap()[jobId];
  return row || null;
}

export function listLocalProgress(): LocalListenProgress[] {
  return Object.values(readMap()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveLocalProgress(input: {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed?: boolean;
  incrementPlay?: boolean;
}): LocalListenProgress {
  const map = readMap();
  const prev = map[input.jobId];
  const durationSec = Math.max(0, input.durationSec || prev?.durationSec || 0);
  const progressSec = Math.max(0, input.progressSec || 0);
  const ratio = durationSec > 0 ? progressSec / durationSec : 0;
  const completed =
    input.completed === true ||
    (durationSec > 0 && (ratio >= 0.92 || progressSec >= durationSec - 0.75));

  const next: LocalListenProgress = {
    jobId: input.jobId,
    progressSec: completed && durationSec > 0 ? durationSec : progressSec,
    durationSec,
    completed,
    updatedAt: Date.now(),
    playCount: (prev?.playCount || 0) + (input.incrementPlay ? 1 : 0),
  };

  // 避免倒退覆盖（同会话 seek 回退除外：允许更小 progress 若间隔很近）
  if (
    prev &&
    !input.incrementPlay &&
    !completed &&
    next.progressSec + 2 < prev.progressSec &&
    next.updatedAt - prev.updatedAt < 1500
  ) {
    // 允许用户主动回退
  }

  map[input.jobId] = next;
  writeMap(map);
  return next;
}

/** 合并服务端与本地进度：取更新更近、且更可用的一条 */
export function mergeListenRecord(
  jobId: string,
  server: ListenRecord | null | undefined,
): ListenRecord | null {
  const local = getLocalProgress(jobId);
  if (!server && !local) return null;
  if (!local) return server || null;
  if (!server) {
    return {
      jobId,
      progressSec: local.progressSec,
      durationSec: local.durationSec,
      completed: local.completed,
      lastListenedAt: new Date(local.updatedAt).toISOString(),
      playCount: local.playCount || 0,
    };
  }

  const serverTs = Date.parse(server.lastListenedAt || '') || 0;
  const useLocal =
    local.updatedAt >= serverTs ||
    (local.progressSec > server.progressSec + 1 && !server.completed);

  if (!useLocal) {
    // 服务端更新：回写本地，保持浏览器侧也有
    saveLocalProgress({
      jobId,
      progressSec: server.progressSec,
      durationSec: server.durationSec,
      completed: server.completed,
    });
    return {
      ...server,
      playCount: Math.max(server.playCount || 0, local.playCount || 0),
    };
  }

  return {
    jobId,
    progressSec: local.progressSec,
    durationSec: Math.max(local.durationSec, server.durationSec || 0),
    completed: local.completed,
    lastListenedAt: new Date(local.updatedAt).toISOString(),
    playCount: Math.max(server.playCount || 0, local.playCount || 0),
  };
}

/** 计算续播秒数；completed 或进度太小则不续播 */
export function bestResumeSec(
  jobId: string,
  server?: { progressSec?: number; durationSec?: number; completed?: boolean; lastListenedAt?: string } | null,
): number | undefined {
  const merged = mergeListenRecord(
    jobId,
    server
      ? {
          jobId,
          progressSec: server.progressSec || 0,
          durationSec: server.durationSec || 0,
          completed: Boolean(server.completed),
          lastListenedAt: server.lastListenedAt || new Date(0).toISOString(),
          playCount: 0,
        }
      : null,
  );
  if (!merged || merged.completed) return undefined;
  if (merged.progressSec <= 3) return undefined;
  if (merged.durationSec > 0 && merged.progressSec >= merged.durationSec - 1.5) {
    return undefined;
  }
  return merged.progressSec;
}

export function saveLastTrack(snapshot: LastTrackSnapshot): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(LAST_TRACK_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function getLastTrack(): LastTrackSnapshot | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(LAST_TRACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastTrackSnapshot;
  } catch {
    return null;
  }
}

export function clearLastTrack(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(LAST_TRACK_KEY);
  } catch {
    // ignore
  }
}

/** 写本地 + 异步同步服务端（失败不影响本地） */
export function persistProgress(input: {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed?: boolean;
  incrementPlay?: boolean;
}): LocalListenProgress {
  const local = saveLocalProgress(input);
  void reportProgress(input.jobId, {
    progressSec: local.progressSec,
    durationSec: local.durationSec,
    completed: local.completed || undefined,
    incrementPlay: input.incrementPlay,
  }).catch(() => {
    // 离线时仅保留本地
  });
  return local;
}
