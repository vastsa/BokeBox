import {
  PROJECT_GITHUB_URL,
  PROJECT_NAME,
} from './project';
import {
  formatSiteTitle,
  getCachedSiteName,
  normalizeSiteName,
  subscribeSiteName,
} from './site';

export type SiteSeoInput = {
  title: string;
  description: string;
  keywords: string;
};

export type PublicSiteSeo = {
  title: string;
  description: string;
  keywords: string;
  github: string;
  attribution: string;
};

export const SITE_ATTRIBUTION = `Powered by ${PROJECT_NAME} · ${PROJECT_GITHUB_URL}`;

/** 未自定义时的默认 SEO 标题 */
export const DEFAULT_SEO_TITLE = 'BokeBox · 私人 AI 播客工作室';

/** 未自定义时的默认 SEO 原文（不含 Powered by） */
export const DEFAULT_SITE_SEO_INPUT: SiteSeoInput = {
  title: '',
  description:
    'BokeBox 将视频、链接、文稿等多元内容转化为可收听的私人播客。支持自定义主播人设与音色，内置 MCP 与可扩展内容源，支持本地私有部署，数据自主可控。',
  keywords:
    'BokeBox, AI播客, 私人播客, 智能口播, 多源内容, 内容转播客, MCP, 自托管, 开源',
};

const SEO_CACHE_KEY = 'pb:site-seo';
type SeoListener = (seo: PublicSiteSeo) => void;
const listeners = new Set<SeoListener>();

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim();
}

export function normalizeSeoTitle(raw?: string | null): string {
  return clip(normalizeSiteName(raw), 80);
}

export function normalizeSeoDescription(raw?: string | null): string {
  let text = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  text = text
    .replace(
      /\s*[·|｜]\s*Powered by BokeBox(?:\s*[·|｜]\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?)?/gi,
      '',
    )
    .replace(
      /\s*Powered by BokeBox(?:\s*[·|｜]\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?)?/gi,
      '',
    )
    .replace(/\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clip(text, 300);
}

export function normalizeSeoKeywords(raw?: string | null): string {
  const parts = String(raw ?? '')
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return clip(out.join(', '), 200);
}

export function withSeoAttribution(description?: string | null): string {
  const base = normalizeSeoDescription(description);
  if (!base) return SITE_ATTRIBUTION;
  return `${base} · ${SITE_ATTRIBUTION}`;
}

export function buildPublicSiteSeo(
  input?: Partial<SiteSeoInput> | null,
  siteName = getCachedSiteName(),
): PublicSiteSeo {
  const titleRaw = normalizeSeoTitle(input?.title);
  const name = normalizeSiteName(siteName);
  const title = titleRaw
    ? formatSiteTitle(titleRaw)
    : name
      ? formatSiteTitle(name)
      : DEFAULT_SEO_TITLE;
  const description = withSeoAttribution(
    input?.description || DEFAULT_SITE_SEO_INPUT.description,
  );
  let keywords = normalizeSeoKeywords(
    input?.keywords || DEFAULT_SITE_SEO_INPUT.keywords,
  );
  if (!/(^|,\s*)bokebox(,|$)/i.test(keywords)) {
    keywords = keywords ? `${keywords}, BokeBox` : 'BokeBox';
  }
  return {
    title,
    description,
    keywords,
    github: PROJECT_GITHUB_URL,
    attribution: SITE_ATTRIBUTION,
  };
}

export function getCachedSeo(): PublicSiteSeo {
  try {
    const raw = localStorage.getItem(SEO_CACHE_KEY);
    if (!raw) return buildPublicSiteSeo();
    const parsed = JSON.parse(raw) as PublicSiteSeo;
    // 缓存也强制出处
    return {
      ...parsed,
      description: withSeoAttribution(
        normalizeSeoDescription(parsed.description),
      ),
      github: PROJECT_GITHUB_URL,
      attribution: SITE_ATTRIBUTION,
      title: parsed.title || (getCachedSiteName() ? formatSiteTitle(getCachedSiteName()) : DEFAULT_SEO_TITLE),
      keywords: parsed.keywords || DEFAULT_SITE_SEO_INPUT.keywords,
    };
  } catch {
    return buildPublicSiteSeo();
  }
}

export function setCachedSeo(seo: PublicSiteSeo): PublicSiteSeo {
  const next: PublicSiteSeo = {
    title: seo.title || (getCachedSiteName() ? formatSiteTitle(getCachedSiteName()) : DEFAULT_SEO_TITLE),
    description: withSeoAttribution(seo.description || DEFAULT_SITE_SEO_INPUT.description),
    keywords: seo.keywords || DEFAULT_SITE_SEO_INPUT.keywords,
    github: PROJECT_GITHUB_URL,
    attribution: SITE_ATTRIBUTION,
  };
  try {
    localStorage.setItem(SEO_CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  for (const cb of listeners) cb(next);
  applySeoToDocument(next);
  return next;
}

export function subscribeSeo(listener: SeoListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string,
): void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export type PageSeoOverride = {
  title?: string;
  description?: string;
  keywords?: string[] | string;
  /** 规范化 path，如 /play/xxx */
  path?: string;
  imageUrl?: string;
  noIndex?: boolean;
  ogType?: string;
};

export type DocumentHeadOptions = {
  path?: string;
  imageUrl?: string;
  noIndex?: boolean;
  ogType?: string;
};

function currentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin || '';
}

function normalizeSeoPath(path?: string | null): string {
  let p = (path || (typeof window !== 'undefined' ? window.location.pathname : '/') || '/').split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p === '/' || p === '/index.html') return '/home';
  return p;
}

export function currentCanonicalUrl(path?: string | null): string {
  if (typeof window === 'undefined') return '';
  const origin = currentOrigin();
  return `${origin}${normalizeSeoPath(path)}`;
}

function mergeKeywords(
  base: string,
  extra?: string[] | string | null,
): string {
  const parts = [
    ...base.split(/[,，、]/),
    ...(Array.isArray(extra)
      ? extra
      : extra
        ? String(extra).split(/[,，、]/)
        : []),
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  return normalizeSeoKeywords(parts.join(', '));
}

/** 在站点 SEO 上叠加页面字段 */
export function buildPageSeo(override?: PageSeoOverride | null): PublicSiteSeo {
  const site = getCachedSeo();
  if (!override) return site;
  const title = normalizeSeoTitle(override.title) || site.title;
  const description = override.description
    ? withSeoAttribution(override.description)
    : site.description;
  const keywords = mergeKeywords(site.keywords, override.keywords);
  return {
    ...site,
    title: title || site.title,
    description,
    keywords,
  };
}

/** 将 SEO 写入 document head（强制出处 + 全局 OG/Twitter/canonical） */
export function applyDocumentHead(
  seo: PublicSiteSeo,
  options: DocumentHeadOptions = {},
): void {
  if (typeof document === 'undefined') return;
  document.title = seo.title;
  upsertMeta('name', 'description', seo.description);
  upsertMeta('name', 'keywords', seo.keywords);
  upsertMeta('name', 'author', PROJECT_NAME);
  upsertMeta('name', 'generator', `${PROJECT_NAME} (${PROJECT_GITHUB_URL})`);
  upsertMeta('name', 'application-name', PROJECT_NAME);
  upsertMeta(
    'name',
    'robots',
    options.noIndex ? 'noindex,nofollow' : 'index,follow',
  );
  upsertMeta('property', 'og:title', seo.title);
  upsertMeta('property', 'og:description', seo.description);
  upsertMeta('property', 'og:type', options.ogType || 'website');
  upsertMeta('property', 'og:site_name', PROJECT_NAME);
  upsertMeta('property', 'og:locale', document.documentElement.lang || 'zh-CN');
  const canonical = currentCanonicalUrl(options.path);
  if (canonical) {
    upsertMeta('property', 'og:url', canonical);
    upsertLink('canonical', canonical);
  }
  const origin = currentOrigin();
  let image = options.imageUrl || '';
  if (image && image.startsWith('/') && origin) {
    image = `${origin}${image}`;
  }
  if (!image && origin) image = `${origin}/logo.webp`;
  if (image) {
    // 去掉可能残留的 access_token
    try {
      const u = new URL(image, origin || 'http://local.invalid');
      u.searchParams.delete('access_token');
      image = u.toString();
    } catch {
      // keep
    }
    upsertMeta('property', 'og:image', image);
    upsertMeta('name', 'twitter:image', image);
  }
  upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', seo.title);
  upsertMeta('name', 'twitter:description', seo.description);
  upsertLink('author', PROJECT_GITHUB_URL);
}

/** @deprecated 使用 applyDocumentHead；保留兼容 */
export function applySeoToDocument(seo: PublicSiteSeo): void {
  applyDocumentHead(seo);
}

/** 路由切换时若无页面覆盖，回落站点 SEO + 当前 path */
export function syncRouteSeo(path?: string | null): void {
  applyDocumentHead(getCachedSeo(), { path: path || undefined });
}

/** 启动时同步站点名变化到 SEO 标题（无自定义 title 时） */
export function initSeoRuntime(): () => void {
  applyDocumentHead(getCachedSeo());
  // 路由级 SEO 由 App / 页面负责；此处只响应站点名变更
  const unsubSite = subscribeSiteName(() => {
    applyDocumentHead(getCachedSeo(), {
      path: typeof window !== 'undefined' ? window.location.pathname : '/home',
    });
  });
  return () => {
    unsubSite();
  };
}
