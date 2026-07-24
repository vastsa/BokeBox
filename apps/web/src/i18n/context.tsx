import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getLocale,
  getLocalePreference,
  LOCALE_META,
  UI_LOCALES,
  setLocale as persistLocale,
  setLocalePreference as persistLocalePreference,
  subscribeLocale,
  subscribeLocalePreference,
  type Locale,
  type LocalePreference,
} from './locale';
import {
  createTranslator,
  type MessageKey,
  type TranslateParams,
  type Translator,
} from './translate';

type I18nContextValue = {
  /** 解析后的实际界面语言 */
  locale: Locale;
  /** 用户偏好：system | 具体语言 */
  localePref: LocalePreference;
  locales: Locale[];
  /** 固定为某一 UI 语言 */
  setLocale: (locale: Locale) => void;
  /** 设置偏好（含跟随系统） */
  setLocalePreference: (preference: LocalePreference) => void;
  t: Translator;
  meta: typeof LOCALE_META;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());
  const [localePref, setLocalePrefState] = useState<LocalePreference>(() =>
    getLocalePreference(),
  );

  useEffect(() => {
    // 文档 title 由 pageSeo / seo 运行时统一管理；此处只同步 locale 状态
    // 语言切换时派发事件，让路由层可按需重算页面 SEO
    const unsubLocale = subscribeLocale((next) => {
      setLocaleState(next);
      window.dispatchEvent(new CustomEvent('pb:locale-change', { detail: next }));
    });
    const unsubPref = subscribeLocalePreference((next) => {
      setLocalePrefState(next);
    });
    return () => {
      unsubLocale();
      unsubPref();
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
  }, []);

  const setLocalePreference = useCallback((next: LocalePreference) => {
    persistLocalePreference(next);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localePref,
      locales: UI_LOCALES,
      setLocale,
      setLocalePreference,
      t,
      meta: LOCALE_META,
    }),
    [locale, localePref, setLocale, setLocalePreference, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

/** 非组件环境使用：读取当前语言的翻译函数 */
export function tOutside(key: MessageKey | string, params?: TranslateParams): string {
  return createTranslator(getLocale())(key, params);
}
