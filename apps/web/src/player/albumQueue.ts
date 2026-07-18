const KEY = 'pb.albumQueue.v1';

export type AlbumQueueState = {
  albumId: string;
  albumTitle: string;
  jobIds: string[];
};

export function saveAlbumQueue(state: AlbumQueueState | null): void {
  try {
    if (!state || !state.jobIds.length) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadAlbumQueue(): AlbumQueueState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AlbumQueueState;
    if (!parsed?.albumId || !Array.isArray(parsed.jobIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAlbumQueue(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
