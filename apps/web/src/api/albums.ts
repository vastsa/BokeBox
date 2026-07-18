import type { AlbumDetail, AlbumSummary } from '../types/album';
import type { AlbumListResult, ListQuery } from '../types/pagination';
import { fetchAllPages, request, toQuery } from './http';


export async function fetchAlbums(
  params: ListQuery = {},
): Promise<AlbumListResult> {
  const data = await request<{
    albums: AlbumSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/albums${toQuery({
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

export async function fetchAllAlbums(
  params: Omit<ListQuery, 'page' | 'pageSize'> = {},
): Promise<AlbumSummary[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchAlbums({ ...params, page, pageSize });
    return { items: res.albums, totalPages: res.totalPages };
  });
}

export async function fetchAlbum(id: string): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}`,
  );
  return data.album;
}

export async function createAlbumApi(body: {
  title: string;
  summary?: string;
  coverJobId?: string | null;
  published?: boolean;
  jobIds?: string[];
}): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>('/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.album;
}

export async function updateAlbumApi(
  id: string,
  body: {
    title?: string;
    summary?: string;
    coverJobId?: string | null;
    published?: boolean;
  },
): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return data.album;
}

export async function setAlbumItemsApi(
  id: string,
  jobIds: string[],
): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}/items`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    },
  );
  return data.album;
}

export async function deleteAlbumApi(id: string): Promise<void> {
  await request(`/albums/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function generateAlbumCoverApi(id: string): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}/generate-cover`,
    { method: 'POST' },
  );
  return data.album;
}
