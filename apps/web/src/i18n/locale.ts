/**
 * UI 语言持久化与检测
 * 语言清单见 registry.ts（扩展入口）
 */
import {
  DEFAULT_UI_LOCALE,
  isUiLocale,
  resolveUiLocale,
  UI_LOCALES,
  type Locale,
} from './registry';

export type { Locale } from './registry';
export {
  CONTENT_LOCALES,
  DEFAULT_CONTENT_LOCALE,
  DEFAULT_LOCALE,
  DEFAULT_UI_LOCALE,
  LOCALES,
  LOCALE_DEFINITIONS,
  LOCALE_META,
  UI_LOCALES,
  getLocaleDefinition,
  isContentLocale,
  isLocale,
  isUiLocale,
  listLocaleMeta,
  resolveContentLocale,
  resolveRegisteredLocale,
  resolveUiLocale,
  type LocaleDefinition,
  type LocaleMeta,
} from './registry';

/** 界面可选语言（兼容旧名 LOCALES 仅 UI） */
export const LOCALES_UI = UI_LOCALES;

const STORAGE_KEY = 'pb-locale';

type LocaleListener = (locale: Locale) => void;
const listeners = new Set<LocaleListener>();

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_UI_LOCALE;
  const candidates = [
    navigator.language,
    ...(navigator.languages || []),
  ].filter(Boolean);
  for (const lang of candidates) {
    const resolved = resolveUiLocale(String(lang));
    if (isUiLocale(resolved)) return resolved;
  }
  return DEFAULT_UI_LOCALE;
}

export function getLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isUiLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return detectBrowserLocale();
}

function notify(locale: Locale) {
  listeners.forEach((listener) => listener(locale));
}

export function applyLocale(locale: Locale = getLocale()): Locale {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  notify(locale);
  return locale;
}

export function setLocale(locale: Locale): Locale {
  const next = isUiLocale(locale) ? locale : DEFAULT_UI_LOCALE;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  return applyLocale(next);
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  listener(getLocale());
  return () => {
    listeners.delete(listener);
  };
}

export function initLocale(): Locale {
  return applyLocale(getLocale());
}
