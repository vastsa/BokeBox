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
  const title = titleRaw
    ? formatSiteTitle(titleRaw)
    : formatSiteTitle(siteName);
  const description = input?.description
    ? withSeoAttribution(input.description)
    : withSeoAttribution(
        title === PROJECT_NAME ? 'AI private podcast box' : title,
      );
  let keywords = normalizeSeoKeywords(input?.keywords);
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
      title: parsed.title || formatSiteTitle(getCachedSiteName()),
      keywords: parsed.keywords || 'BokeBox',
    };
  } catch {
    return buildPublicSiteSeo();
  }
}

export function setCachedSeo(seo: PublicSiteSeo): PublicSiteSeo {
  const next: PublicSiteSeo = {
    title: seo.title || formatSiteTitle(getCachedSiteName()),
    description: withSeoAttribution(seo.description),
    keywords: seo.keywords || 'BokeBox',
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

/** 将 SEO 写入 document head（强制出处） */
export function applySeoToDocument(seo: PublicSiteSeo): void {
  if (typeof document === 'undefined') return;
  document.title = seo.title;
  upsertMeta('name', 'description', seo.description);
  upsertMeta('name', 'keywords', seo.keywords);
  upsertMeta('name', 'author', PROJECT_NAME);
  upsertMeta('name', 'generator', `${PROJECT_NAME} (${PROJECT_GITHUB_URL})`);
  upsertMeta('name', 'application-name', seo.title);
  upsertMeta('property', 'og:title', seo.title);
  upsertMeta('property', 'og:description', seo.description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', seo.title);
  upsertMeta('name', 'twitter:card', 'summary');
  upsertMeta('name', 'twitter:title', seo.title);
  upsertMeta('name', 'twitter:description', seo.description);
  upsertLink('author', PROJECT_GITHUB_URL);
}

/** 启动时同步站点名变化到 SEO 标题（无自定义 title 时） */
export function initSeoRuntime(): () => void {
  applySeoToDocument(getCachedSeo());
  return subscribeSiteName(() => {
    // 站点名变更时，若缓存 SEO 仅回落标题，重新应用
    const cached = getCachedSeo();
    applySeoToDocument(cached);
  });
}
