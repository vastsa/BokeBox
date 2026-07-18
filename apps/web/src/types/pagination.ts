/** 统一分页元信息（与后端 PageMeta 对齐） */
export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type JobListFilter =
  | 'all'
  | 'active'
  | 'published'
  | 'draft'
  | 'failed'
  | 'done'
  /** 首页流水线：制作中 + 失败 */
  | 'pipeline';

export type JobListFacets = {
  all: number;
  active: number;
  published: number;
  draft: number;
  failed: number;
  done: number;
};

export type LibraryListFilter = 'all' | 'unplayed' | 'progress' | 'done';

export type LibraryListFacets = Record<LibraryListFilter, number>;

export type JobListResult = PageMeta & {
  jobs: import('./job').Job[];
  facets: JobListFacets;
};

export type LibraryListResult = PageMeta & {
  items: import('./job').LibraryItem[];
  facets: LibraryListFacets;
};

export type HistoryListResult = PageMeta & {
  items: import('./job').LibraryItem[];
};

export type AlbumListResult = PageMeta & {
  albums: import('./album').AlbumSummary[];
};

export type ListQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
};
