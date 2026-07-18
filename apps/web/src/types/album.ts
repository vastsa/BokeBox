import type { Job, ListenRecord } from './job';

export type AlbumSummary = {
  id: string;
  title: string;
  summary: string;
  coverJobId: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  resolvedCoverJobId: string | null;
  hasCoverImage?: boolean;
  coverGradient?: string;
};

export type AlbumDetail = AlbumSummary & {
  items: Array<{
    jobId: string;
    position: number;
  }>;
};

export type AlbumListenItem = {
  job: Job;
  listen: ListenRecord | null;
  position: number;
};

export type AlbumListenDetail = AlbumSummary & {
  items: AlbumListenItem[];
};
