/**
 * 语言注册中心（前端）
 * 与 apps/server/src/i18n/registry.ts 保持同步。
 * 新增语言：两边 registry 各加一项；UI 文案仅 ui:true 需要 messages。
 */

export type ScriptDensity = 'cjk' | 'latin';

export type LocaleDefinition = {
  code: string;
  label: string;
  nativeLabel: string;
  short: string;
  aliases: string[];
  ui: boolean;
  content: boolean;
  density: ScriptDensity;
  promptLanguage: string;
};

export const LOCALE_DEFINITIONS = [
  {
    code: 'zh-CN',
    label: 'Chinese (Simplified)',
    nativeLabel: '简体中文',
    short: '中文',
    aliases: ['zh', 'zh-cn', 'zh-hans', 'zh-sg'],
    ui: true,
    content: true,
    density: 'cjk',
    promptLanguage: 'Simplified Chinese',
  },
  {
    code: 'zh-TW',
    label: 'Chinese (Traditional)',
    nativeLabel: '繁體中文',
    short: '繁中',
    aliases: ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Traditional Chinese',
  },
  {
    code: 'en-US',
    label: 'English',
    nativeLabel: 'English',
    short: 'EN',
    aliases: ['en', 'en-us', 'en-gb', 'en-au', 'en-ca'],
    ui: true,
    content: true,
    density: 'latin',
    promptLanguage: 'English',
  },
  {
    code: 'ja-JP',
    label: 'Japanese',
    nativeLabel: '日本語',
    short: 'JA',
    aliases: ['ja', 'ja-jp'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Japanese',
  },
  {
    code: 'ko-KR',
    label: 'Korean',
    nativeLabel: '한국어',
    short: 'KO',
    aliases: ['ko', 'ko-kr'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Korean',
  },
  {
    code: 'es-ES',
    label: 'Spanish',
    nativeLabel: 'Español',
    short: 'ES',
    aliases: ['es', 'es-es', 'es-mx', 'es-419', 'es-ar'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Spanish',
  },
  {
    code: 'fr-FR',
    label: 'French',
    nativeLabel: 'Français',
    short: 'FR',
    aliases: ['fr', 'fr-fr', 'fr-ca', 'fr-be'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'French',
  },
  {
    code: 'de-DE',
    label: 'German',
    nativeLabel: 'Deutsch',
    short: 'DE',
    aliases: ['de', 'de-de', 'de-at', 'de-ch'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'German',
  },
  {
    code: 'pt-BR',
    label: 'Portuguese',
    nativeLabel: 'Português',
    short: 'PT',
    aliases: ['pt', 'pt-br', 'pt-pt'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Portuguese',
  },
  {
    code: 'ru-RU',
    label: 'Russian',
    nativeLabel: 'Русский',
    short: 'RU',
    aliases: ['ru', 'ru-ru'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Russian',
  },
  {
    code: 'ar-SA',
    label: 'Arabic',
    nativeLabel: 'العربية',
    short: 'AR',
    aliases: ['ar', 'ar-sa', 'ar-ae', 'ar-eg'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Arabic',
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    short: 'HI',
    aliases: ['hi', 'hi-in'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Hindi',
  },
  {
    code: 'vi-VN',
    label: 'Vietnamese',
    nativeLabel: 'Tiếng Việt',
    short: 'VI',
    aliases: ['vi', 'vi-vn'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Vietnamese',
  },
  {
    code: 'th-TH',
    label: 'Thai',
    nativeLabel: 'ไทย',
    short: 'TH',
    aliases: ['th', 'th-th'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Thai',
  },
  {
    code: 'id-ID',
    label: 'Indonesian',
    nativeLabel: 'Bahasa Indonesia',
    short: 'ID',
    aliases: ['id', 'id-id'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Indonesian',
  },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof LOCALE_DEFINITIONS)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const DEFAULT_CONTENT_LOCALE: Locale = 'zh-CN';
export const DEFAULT_UI_LOCALE: Locale = 'zh-CN';

export const LOCALES: Locale[] = LOCALE_DEFINITIONS.map((d) => d.code);
export const UI_LOCALES: Locale[] = LOCALE_DEFINITIONS.filter((d) => d.ui).map(
  (d) => d.code,
);
export const CONTENT_LOCALES: Locale[] = LOCALE_DEFINITIONS.filter(
  (d) => d.content,
).map((d) => d.code);

export type LocaleMeta = {
  code: Locale;
  label: string;
  nativeLabel: string;
  short: string;
  ui: boolean;
  content: boolean;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = Object.fromEntries(
  LOCALE_DEFINITIONS.map((d) => [
    d.code,
    {
      code: d.code,
      label: d.label,
      nativeLabel: d.nativeLabel,
      short: d.short,
      ui: d.ui,
      content: d.content,
    },
  ]),
) as Record<Locale, LocaleMeta>;

const CODE_SET = new Set<string>(LOCALES);
const ALIAS_MAP = new Map<string, Locale>();
for (const def of LOCALE_DEFINITIONS) {
  ALIAS_MAP.set(def.code.toLowerCase(), def.code);
  for (const alias of def.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), def.code);
  }
}

export function getLocaleDefinition(code: string | null | undefined) {
  if (!code) return undefined;
  const resolved = ALIAS_MAP.get(String(code).trim().toLowerCase());
  if (!resolved) return undefined;
  return LOCALE_DEFINITIONS.find((d) => d.code === resolved);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && CODE_SET.has(value);
}

export function isUiLocale(value: unknown): value is Locale {
  return isLocale(value) && Boolean(LOCALE_META[value]?.ui);
}

export function isContentLocale(value: unknown): value is Locale {
  return isLocale(value) && Boolean(LOCALE_META[value]?.content);
}

export function resolveRegisteredLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!input) return fallback;
  const raw = String(input).trim();
  if (isLocale(raw)) return raw;
  const byAlias = ALIAS_MAP.get(raw.toLowerCase());
  if (byAlias) return byAlias;
  const primary = raw.toLowerCase().split(',')[0]?.split(';')[0]?.trim();
  if (primary) {
    const hit = ALIAS_MAP.get(primary);
    if (hit) return hit;
    const prefixHit = ALIAS_MAP.get(primary.split('-')[0]);
    if (prefixHit) return prefixHit;
  }
  return fallback;
}

export function resolveUiLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_UI_LOCALE,
): Locale {
  const loc = resolveRegisteredLocale(input, fallback);
  if (isUiLocale(loc)) return loc;
  return isUiLocale(fallback) ? fallback : DEFAULT_UI_LOCALE;
}

export function resolveContentLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_CONTENT_LOCALE,
): Locale {
  const loc = resolveRegisteredLocale(input, fallback);
  if (isContentLocale(loc)) return loc;
  return isContentLocale(fallback) ? fallback : DEFAULT_CONTENT_LOCALE;
}

export function listLocaleMeta(filter?: {
  ui?: boolean;
  content?: boolean;
}): LocaleMeta[] {
  return LOCALE_DEFINITIONS.filter((d) => {
    if (filter?.ui != null && d.ui !== filter.ui) return false;
    if (filter?.content != null && d.content !== filter.content) return false;
    return true;
  }).map((d) => LOCALE_META[d.code]);
}
