import type { Job, ListenRecord } from './job';

export type AlbumSummary = {
  id: string;
  title: string;
  summary: string;
  coverJobId: string | null;
  /** 专辑专属 AI 封面 */
  hasOwnCoverImage?: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  resolvedCoverJobId: string | null;
  /** 解析后的单集封面（无专属封面时用） */
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
