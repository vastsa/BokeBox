const CACHE_KEY = 'pb:site-name';
export const SITE_BRAND = 'BokeBox';
export const SITE_TITLE_SUFFIX = ` - ${SITE_BRAND}`;
const SITE_NAME_MAX = 48;

type Listener = (siteName: string) => void;
const listeners = new Set<Listener>();

/** 规范化站点名称（不含品牌后缀） */
export function normalizeSiteName(raw?: string | null): string {
  let name = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const stripTokens = [
    SITE_TITLE_SUFFIX,
    `-${SITE_BRAND}`,
    `- ${SITE_BRAND}`,
    SITE_BRAND,
  ];
  let changed = true;
  while (changed && name) {
    changed = false;
    for (const token of stripTokens) {
      if (name === token) {
        name = '';
        changed = true;
        break;
      }
      if (name.endsWith(token)) {
        name = name.slice(0, -token.length).trim();
        changed = true;
        break;
      }
    }
  }
  if (name.length > SITE_NAME_MAX) name = name.slice(0, SITE_NAME_MAX).trim();
  return name;
}

/** 最终展示：自定义名 - BokeBox；未设置则为 BokeBox */
export function formatSiteTitle(siteName?: string | null): string {
  const name = normalizeSiteName(siteName);
  return name ? `${name}${SITE_TITLE_SUFFIX}` : SITE_BRAND;
}

export function getCachedSiteName(): string {
  try {
    return normalizeSiteName(localStorage.getItem(CACHE_KEY));
  } catch {
    return '';
  }
}

export function setCachedSiteName(raw?: string | null): string {
  const next = normalizeSiteName(raw);
  try {
    if (!next) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, next);
  } catch {
    // ignore
  }
  for (const cb of listeners) cb(next);
  return next;
}

export function subscribeSiteName(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 浏览器标题：站点标题 · 副标题 */
export function formatDocumentTitle(
  siteName: string | null | undefined,
  fallbackDocumentTitle: string,
  subtitle?: string,
): string {
  const title = formatSiteTitle(siteName);
  if (!siteName || !normalizeSiteName(siteName)) {
    return fallbackDocumentTitle;
  }
  const sub = (subtitle || '').trim();
  return sub ? `${title} · ${sub}` : title;
}
