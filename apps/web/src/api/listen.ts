import type {
  AlbumListenDetail,
  AlbumSummary,
} from '../types/album';
import type { LibraryItem, ListenRecord } from '../types/job';
import type {
  AlbumListResult,
  HistoryListResult,
  LibraryListFacets,
  LibraryListFilter,
  LibraryListResult,
  ListQuery,
} from '../types/pagination';
import { fetchAllPages, request, toQuery } from './http';


export async function fetchLibrary(
  params: ListQuery & { filter?: LibraryListFilter } = {},
): Promise<LibraryListResult> {
  const data = await request<
    {
      items: LibraryItem[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      facets?: LibraryListFacets;
    }
  >(
    `/listen/library${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      filter: params.filter,
    })}`,
  );
  return {
    items: data.items || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 10,
    total: data.total ?? (data.items || []).length,
    totalPages: data.totalPages || 1,
    facets: data.facets || {
      all: data.total ?? 0,
      unplayed: 0,
      progress: 0,
      done: 0,
    },
  };
}

/** 拉全部曲库（标签星图 / 播放队列） */
export async function fetchAllLibrary(
  params: Omit<ListQuery, 'page' | 'pageSize'> & {
    filter?: LibraryListFilter;
  } = {},
): Promise<LibraryItem[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchLibrary({ ...params, page, pageSize });
    return { items: res.items, totalPages: res.totalPages };
  });
}

export async function fetchHistory(
  params: ListQuery = {},
): Promise<HistoryListResult> {
  const data = await request<{
    items: LibraryItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/listen/history${toQuery({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
  );
  return {
    items: data.items || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.items || []).length,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchListenItem(id: string): Promise<LibraryItem> {
  return request(`/listen/${id}`);
}

export async function reportProgress(
  id: string,
  body: {
    progressSec: number;
    durationSec: number;
    completed?: boolean;
    incrementPlay?: boolean;
  },
): Promise<ListenRecord> {
  const data = await request<{ listen: ListenRecord }>(`/listen/${id}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.listen;
}



// ---------- Albums ----------

export async function fetchListenAlbums(
  params: ListQuery = {},
): Promise<AlbumListResult> {
  const data = await request<{
    albums: AlbumSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/listen/albums${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
    })}`,
  );
  return {
    albums: data.albums || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.albums || []).length,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchAllListenAlbums(
  params: Omit<ListQuery, 'page' | 'pageSize'> = {},
): Promise<AlbumSummary[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchListenAlbums({ ...params, page, pageSize });
    return { items: res.albums, totalPages: res.totalPages };
  });
}

export async function fetchListenAlbum(id: string): Promise<AlbumListenDetail> {
  const data = await request<{ album: AlbumListenDetail }>(
    `/listen/albums/${encodeURIComponent(id)}`,
  );
  return data.album;
}
