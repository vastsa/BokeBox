export type Locale = 'zh-CN' | 'en-US';

export const LOCALES: Locale[] = ['zh-CN', 'en-US'];

export const LOCALE_META: Record<
  Locale,
  { label: string; nativeLabel: string; short: string }
> = {
  'zh-CN': { label: 'Chinese', nativeLabel: '简体中文', short: '中文' },
  'en-US': { label: 'English', nativeLabel: 'English', short: 'EN' },
};

const STORAGE_KEY = 'pb-locale';

type LocaleListener = (locale: Locale) => void;

const listeners = new Set<LocaleListener>();

function isLocale(value: string | null): value is Locale {
  return value === 'zh-CN' || value === 'en-US';
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const candidates = [
    navigator.language,
    ...(navigator.languages || []),
  ]
    .filter(Boolean)
    .map((x) => x.toLowerCase());

  for (const lang of candidates) {
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang.startsWith('en')) return 'en-US';
  }
  return 'zh-CN';
}

export function getLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return detectBrowserLocale();
}

function notify(locale: Locale) {
  listeners.forEach((listener) => listener(locale));
}

/** 应用语言到 html[lang] 与 document.title */
export function applyLocale(locale: Locale = getLocale()): Locale {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  notify(locale);
  return locale;
}

export function setLocale(locale: Locale): Locale {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  return applyLocale(locale);
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  listener(getLocale());
  return () => {
    listeners.delete(listener);
  };
}

/** 启动时初始化语言 */
export function initLocale(): Locale {
  return applyLocale(getLocale());
}
