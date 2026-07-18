export type Album = {
  id: string;
  title: string;
  summary: string;
  /** 封面用 job id；空则取首集 */
  coverJobId: string | null;
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
