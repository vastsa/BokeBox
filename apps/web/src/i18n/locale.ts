/**
 * UI 语言持久化与检测
 * 语言清单见 registry.ts（扩展入口）
 *
 * 偏好：system | 具体 UI 语言
 * - system：跟随浏览器/系统语言，默认
 * - zh-CN / en-US …：固定界面语言
 * getLocale() 始终返回解析后的具体语言，供 API / 文案使用
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

/** 用户语言偏好：跟随系统或固定某 UI 语言 */
export type LocalePreference = Locale | 'system';

const STORAGE_KEY = 'pb-locale';

type LocaleListener = (locale: Locale) => void;
type PreferenceListener = (preference: LocalePreference) => void;

const listeners = new Set<LocaleListener>();
const preferenceListeners = new Set<PreferenceListener>();

let languageChangeBound = false;

function isLocalePreference(value: string | null): value is LocalePreference {
  return value === 'system' || isUiLocale(value);
}

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

/** 读取用户语言偏好；缺省跟随系统 */
export function getLocalePreference(): LocalePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isLocalePreference(raw)) return raw;
  } catch {
    // ignore
  }
  return 'system';
}

/** 将偏好解析为实际 UI 语言 */
export function resolveLocale(
  preference: LocalePreference = getLocalePreference(),
): Locale {
  if (preference === 'system') return detectBrowserLocale();
  return isUiLocale(preference) ? preference : DEFAULT_UI_LOCALE;
}

/** 当前实际界面语言（解析后） */
export function getLocale(): Locale {
  return resolveLocale(getLocalePreference());
}

function notify(locale: Locale, preference: LocalePreference) {
  listeners.forEach((listener) => listener(locale));
  preferenceListeners.forEach((listener) => listener(preference));
}

function stopLanguageChangeWatch() {
  if (!languageChangeBound || typeof window === 'undefined') return;
  window.removeEventListener('languagechange', onLanguageChange);
  languageChangeBound = false;
}

function onLanguageChange() {
  if (getLocalePreference() !== 'system') return;
  applyLocalePreference('system');
}

function startLanguageChangeWatch() {
  if (typeof window === 'undefined') return;
  stopLanguageChangeWatch();
  window.addEventListener('languagechange', onLanguageChange);
  languageChangeBound = true;
}

/**
 * 应用语言偏好
 * - document.documentElement.lang 写解析后的具体语言
 * - system 时监听 languagechange
 */
export function applyLocalePreference(
  preference: LocalePreference = getLocalePreference(),
): Locale {
  const locale = resolveLocale(preference);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-locale-pref', preference);
  }

  if (preference === 'system') {
    startLanguageChangeWatch();
  } else {
    stopLanguageChangeWatch();
  }

  notify(locale, preference);
  return locale;
}

/** @deprecated 兼容旧名：按偏好应用（默认读 storage） */
export function applyLocale(locale?: Locale): Locale {
  if (locale && isUiLocale(locale)) {
    return applyLocalePreference(locale);
  }
  return applyLocalePreference(getLocalePreference());
}

/** 固定为某一 UI 语言 */
export function setLocale(locale: Locale): Locale {
  const next = isUiLocale(locale) ? locale : DEFAULT_UI_LOCALE;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  return applyLocalePreference(next);
}

/** 设置语言偏好（含跟随系统） */
export function setLocalePreference(preference: LocalePreference): Locale {
  const next: LocalePreference =
    preference === 'system' || isUiLocale(preference)
      ? preference
      : 'system';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  return applyLocalePreference(next);
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  listener(getLocale());
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeLocalePreference(
  listener: PreferenceListener,
): () => void {
  preferenceListeners.add(listener);
  listener(getLocalePreference());
  return () => {
    preferenceListeners.delete(listener);
  };
}

export function initLocale(): Locale {
  return applyLocalePreference(getLocalePreference());
}
