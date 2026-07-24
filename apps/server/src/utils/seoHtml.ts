import type { PublicSiteSeo } from '../services/settings/index.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function upsertMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  const re = new RegExp(
    `<meta\\s+[^>]*${attr}=["']${key}["'][^>]*>`,
    'i',
  );
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  // 插入到 </head> 前
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function upsertLink(html: string, rel: string, href: string): string {
  const re = new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, 'i');
  const tag = `<link rel="${rel}" href="${escapeHtml(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

export type SeoInjectOptions = {
  /** 绝对 canonical，如 https://example.com/home */
  canonicalUrl?: string | null;
  /** 绝对 og:image */
  imageUrl?: string | null;
  /** og:locale */
  locale?: string | null;
  /** og:type */
  ogType?: string | null;
  /** 是否禁止索引 */
  noIndex?: boolean;
};

/** 将站点 / 页面 SEO 注入 index.html（强制含出处 + 全局 OG/Twitter/canonical） */
export function injectSeoIntoHtml(
  html: string,
  seo: PublicSiteSeo,
  options: SeoInjectOptions = {},
): string {
  let out = html;
  out = out.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(seo.title)}</title>`,
  );
  out = upsertMeta(out, 'name', 'description', seo.description);
  out = upsertMeta(out, 'name', 'keywords', seo.keywords);
  out = upsertMeta(out, 'name', 'author', 'BokeBox');
  out = upsertMeta(
    out,
    'name',
    'robots',
    options.noIndex ? 'noindex,nofollow' : 'index,follow',
  );
  out = upsertMeta(out, 'property', 'og:title', seo.title);
  out = upsertMeta(out, 'property', 'og:description', seo.description);
  out = upsertMeta(out, 'property', 'og:type', options.ogType || 'website');
  out = upsertMeta(out, 'property', 'og:site_name', 'BokeBox');
  out = upsertMeta(
    out,
    'property',
    'og:locale',
    options.locale || 'zh_CN',
  );
  out = upsertMeta(out, 'name', 'twitter:title', seo.title);
  out = upsertMeta(out, 'name', 'twitter:description', seo.description);
  // 出处链接：canonical 仍可自定义，但增加 generator / 项目出处
  out = upsertMeta(out, 'name', 'generator', `BokeBox (${seo.github})`);
  out = upsertMeta(out, 'name', 'application-name', 'BokeBox');

  if (options.canonicalUrl) {
    out = upsertMeta(out, 'property', 'og:url', options.canonicalUrl);
    out = upsertLink(out, 'canonical', options.canonicalUrl);
  }
  if (options.imageUrl) {
    out = upsertMeta(out, 'property', 'og:image', options.imageUrl);
    out = upsertMeta(out, 'name', 'twitter:image', options.imageUrl);
    out = upsertMeta(out, 'name', 'twitter:card', 'summary_large_image');
  } else {
    out = upsertMeta(out, 'name', 'twitter:card', 'summary');
  }

  // 保留 / 强化 GitHub 出处
  out = upsertLink(out, 'author', seo.github);
  return out;
}
