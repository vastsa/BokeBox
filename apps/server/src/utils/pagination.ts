/** 统一分页参数解析与结果封装 */

export type PageParams = {
  page: number;
  pageSize: number;
  offset: number;
};

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PageResult<T> = PageMeta & {
  items: T[];
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * 解析 page / pageSize 查询参数。
 * page 从 1 起；pageSize 默认 20，上限 100。
 */
export function parsePageQuery(
  query: { page?: unknown; pageSize?: unknown } | undefined,
  defaults?: { pageSize?: number; maxPageSize?: number },
): PageParams {
  const max = defaults?.maxPageSize ?? MAX_PAGE_SIZE;
  const defSize = defaults?.pageSize ?? DEFAULT_PAGE_SIZE;
  const rawPage = Number(query?.page);
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawSize = Number(query?.pageSize);
  let pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.floor(rawSize) : defSize;
  pageSize = Math.min(max, Math.max(1, pageSize));

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildPageMeta(
  total: number,
  page: number,
  pageSize: number,
): PageMeta {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safeSize = Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize) || 1);
  const safePage = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
  return {
    page: safePage,
    pageSize: safeSize,
    total: safeTotal,
    totalPages,
  };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    ...buildPageMeta(total, page, pageSize),
  };
}

/** 模糊搜索转义：% _ \ */
export function likePattern(raw: string): string {
  const q = raw.trim();
  if (!q) return '';
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
