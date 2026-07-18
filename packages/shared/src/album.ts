import type { JobPublic, ListenRecord } from './job.js';

export type Album = {
  id: string;
  title: string;
  summary: string;
  /** 封面用 job id；空则取首集 */
  coverJobId: string | null;
  /** 是否有专辑专属 AI 封面文件 */
  hasOwnCoverImage: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AlbumItem = {
  albumId: string;
  jobId: string;
  position: number;
};

export type AlbumSummary = Album & {
  itemCount: number;
  /** 解析后的封面 job id */
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
  job: JobPublic;
  listen: ListenRecord | null;
  position: number;
};

export type AlbumListenDetail = AlbumSummary & {
  items: AlbumListenItem[];
};

