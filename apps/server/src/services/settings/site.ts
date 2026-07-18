/**
 * 站点：初始化状态、游客访问、品牌与 SEO
 */
import { getAuthAccount } from './auth.js';
import {
  KEY_GUEST_HOME_PUBLIC,
  KEY_SETUP,
  KEY_SITE_NAME,
  KEY_SITE_SEO,
  deleteSetting,
  getSettingRaw,
  parseJson,
  setSettingRaw,
} from './kv.js';

export function isSetupCompleted(): boolean {
  if (getSettingRaw(KEY_SETUP) === '1') return true;
  // 兼容：有账号即视为已初始化
  return Boolean(getAuthAccount());
}

export function markSetupCompleted(): void {
  setSettingRaw(KEY_SETUP, '1');
}

/** 游客是否可浏览首页（曲库）与收听详情 */
export function isGuestHomePublic(): boolean {
  return getSettingRaw(KEY_GUEST_HOME_PUBLIC) === '1';
}

export function setGuestHomePublic(enabled: boolean): boolean {
  setSettingRaw(KEY_GUEST_HOME_PUBLIC, enabled ? '1' : '0');
  return enabled;
}

const SITE_BRAND = 'BokeBox';
const SITE_TITLE_SUFFIX = ` - ${SITE_BRAND}`;
const SITE_NAME_MAX = 48;

/** 规范化站点名称（不含品牌后缀） */
export function normalizeSiteName(raw?: string | null): string {
  let name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  // 避免用户手动带上后缀导致重复
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

/** 读取站点自定义名称（空表示仅展示 BokeBox） */
export function getSiteName(): string {
  return normalizeSiteName(getSettingRaw(KEY_SITE_NAME));
}

export function setSiteName(raw?: string | null): string {
  const next = normalizeSiteName(raw);
  if (!next) {
    deleteSetting(KEY_SITE_NAME);
    return '';
  }
  setSettingRaw(KEY_SITE_NAME, next);
  return next;
}

/** 最终展示名：自定义名 - BokeBox；未设置则为 BokeBox */
export function formatSiteTitle(siteName?: string | null): string {
  const name = normalizeSiteName(siteName ?? getSiteName());
  return name ? `${name}${SITE_TITLE_SUFFIX}` : SITE_BRAND;
}

export function getSiteBrand(): { siteName: string; siteTitle: string } {
  const siteName = getSiteName();
  return { siteName, siteTitle: formatSiteTitle(siteName) };
}

/** 用户可编辑的 SEO 原文（不含强制出处） */
export type SiteSeoInput = {
  /** 自定义 SEO 标题；空则回落站点标题 */
  title: string;
  /** 自定义描述；保存/输出时强制附加出处 */
  description: string;
  /** 关键词，逗号分隔 */
  keywords: string;
};

/** 对外公开 SEO（已拼接出处） */
export type PublicSiteSeo = {
  title: string;
  description: string;
  keywords: string;
  github: string;
  attribution: string;
};

export const SITE_GITHUB_URL = 'https://github.com/vastsa/BokeBox/';
export const SITE_ATTRIBUTION = `Powered by BokeBox · ${SITE_GITHUB_URL}`;

/** 未自定义时的默认 SEO 标题（站点名与自定义标题皆空时使用） */
export const DEFAULT_SEO_TITLE = 'BokeBox · 私人 AI 播客工作室';

/** 未自定义时的默认 SEO 原文（不含 Powered by 出处） */
export const DEFAULT_SITE_SEO_INPUT: SiteSeoInput = {
  title: '',
  description:
    'BokeBox 将视频、链接、文稿等多元内容转化为可收听的私人播客。支持自定义主播人设与音色，内置 MCP 与可扩展内容源，支持本地私有部署，数据自主可控。',
  keywords:
    'BokeBox, AI播客, 私人播客, 智能口播, 多源内容, 内容转播客, MCP, 自托管, 开源',
};

const SEO_TITLE_MAX = 80;
const SEO_DESC_MAX = 300;
const SEO_KEYWORDS_MAX = 200;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim();
}

export function normalizeSeoTitle(raw?: string | null): string {
  // 与站点名相同策略：去掉用户手写的品牌后缀，输出时再统一追加
  return clip(normalizeSiteName(raw), SEO_TITLE_MAX);
}

export function normalizeSeoDescription(raw?: string | null): string {
  let text = String(raw ?? '').trim().replace(/\s+/g, ' ');
  // 去掉已有出处片段，避免重复叠加
  text = text
    .replace(/\s*[·|｜]\s*Powered by BokeBox(?:\s*[·|｜]\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?)?/gi, '')
    .replace(/\s*Powered by BokeBox(?:\s*[·|｜]\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?)?/gi, '')
    .replace(/\s*https?:\/\/github\.com\/vastsa\/BokeBox\/?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clip(text, SEO_DESC_MAX);
}

export function normalizeSeoKeywords(raw?: string | null): string {
  const parts = String(raw ?? '')
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
  // 去重保序
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return clip(out.join(', '), SEO_KEYWORDS_MAX);
}

/** 描述强制保留出处（含 GitHub） */
export function withSeoAttribution(description?: string | null): string {
  const base = normalizeSeoDescription(description);
  if (!base) return SITE_ATTRIBUTION;
  return `${base} · ${SITE_ATTRIBUTION}`;
}

export function getSiteSeoInput(): SiteSeoInput {
  const stored = parseJson<Partial<SiteSeoInput>>(getSettingRaw(KEY_SITE_SEO));
  return {
    title: normalizeSeoTitle(stored?.title),
    description: normalizeSeoDescription(stored?.description),
    keywords: normalizeSeoKeywords(stored?.keywords),
  };
}

export function setSiteSeo(input?: Partial<SiteSeoInput> | null): SiteSeoInput {
  const prev = getSiteSeoInput();
  const next: SiteSeoInput = {
    title:
      input && 'title' in (input as object)
        ? normalizeSeoTitle(input?.title)
        : prev.title,
    description:
      input && 'description' in (input as object)
        ? normalizeSeoDescription(input?.description)
        : prev.description,
    keywords:
      input && 'keywords' in (input as object)
        ? normalizeSeoKeywords(input?.keywords)
        : prev.keywords,
  };
  if (!next.title && !next.description && !next.keywords) {
    deleteSetting(KEY_SITE_SEO);
    return { title: '', description: '', keywords: '' };
  }
  setSettingRaw(KEY_SITE_SEO, JSON.stringify(next));
  return next;
}

/** 最终 SEO 标题：自定义标题 > 站点标题 > 默认标题；有自定义名时保证 - BokeBox */
export function buildSeoTitle(input?: SiteSeoInput | null, siteTitle?: string): string {
  const seo = input ?? getSiteSeoInput();
  if (seo.title) return formatSiteTitle(seo.title);
  if (siteTitle) return siteTitle;
  const name = getSiteName();
  if (name) return formatSiteTitle(name);
  return DEFAULT_SEO_TITLE;
}

export function buildPublicSiteSeo(input?: SiteSeoInput | null): PublicSiteSeo {
  const seo = input ?? getSiteSeoInput();
  const title = buildSeoTitle(seo);
  // 描述：自定义 > 默认产品文案，再强制附加出处
  const description = withSeoAttribution(
    seo.description || DEFAULT_SITE_SEO_INPUT.description,
  );
  // 关键词：自定义 > 默认；始终包含 BokeBox
  let keywords = seo.keywords || DEFAULT_SITE_SEO_INPUT.keywords;
  if (!/(^|,\s*)bokebox(,|$)/i.test(keywords)) {
    keywords = keywords ? `${keywords}, BokeBox` : 'BokeBox';
  }
  return {
    title,
    description,
    keywords,
    github: SITE_GITHUB_URL,
    attribution: SITE_ATTRIBUTION,
  };
}

export type PublicSiteProfile = {
  guestHomePublic: boolean;
  siteName: string;
  siteTitle: string;
  seo: PublicSiteSeo;
  /** 设置页编辑用原文 */
  seoInput: SiteSeoInput;
};

export function getPublicSiteProfile(includeInput = true): PublicSiteProfile {
  const brand = getSiteBrand();
  const seoInput = getSiteSeoInput();
  return {
    guestHomePublic: isGuestHomePublic(),
    siteName: brand.siteName,
    siteTitle: brand.siteTitle,
    seo: buildPublicSiteSeo(seoInput),
    seoInput: includeInput ? seoInput : { title: '', description: '', keywords: '' },
  };
}
