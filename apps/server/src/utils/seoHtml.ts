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

/** 将站点 SEO 注入 index.html（强制含出处） */
export function injectSeoIntoHtml(html: string, seo: PublicSiteSeo): string {
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  out = upsertMeta(out, 'name', 'description', seo.description);
  out = upsertMeta(out, 'name', 'keywords', seo.keywords);
  out = upsertMeta(out, 'name', 'author', 'BokeBox');
  out = upsertMeta(out, 'property', 'og:title', seo.title);
  out = upsertMeta(out, 'property', 'og:description', seo.description);
  out = upsertMeta(out, 'property', 'og:type', 'website');
  out = upsertMeta(out, 'property', 'og:site_name', seo.title);
  out = upsertMeta(out, 'name', 'twitter:card', 'summary');
  out = upsertMeta(out, 'name', 'twitter:title', seo.title);
  out = upsertMeta(out, 'name', 'twitter:description', seo.description);
  // 出处链接：canonical 仍可自定义，但增加 generator / 项目出处
  out = upsertMeta(out, 'name', 'generator', `BokeBox (${seo.github})`);
  out = upsertMeta(out, 'name', 'application-name', seo.title);
  // 保留 / 强化 GitHub 出处
  const linkRe = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  const githubLink = `<link rel="author" href="${escapeHtml(seo.github)}" />`;
  if (!/rel=["']author["']/i.test(out)) {
    out = out.replace(/<\/head>/i, `  ${githubLink}\n</head>`);
  }
  // 不强制改 canonical 到 github，保留站点自身；出处已在 description/generator/author
  if (!linkRe.test(out)) {
    // no-op
  }
  return out;
}
