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
  LOCALE_META,
  UI_LOCALES,
  setLocale as persistLocale,
  subscribeLocale,
  type Locale,
} from './locale';
import {
  createTranslator,
  type MessageKey,
  type TranslateParams,
  type Translator,
} from './translate';

type I18nContextValue = {
  locale: Locale;
  locales: Locale[];
  setLocale: (locale: Locale) => void;
  t: Translator;
  meta: typeof LOCALE_META;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  useEffect(() => {
    // 文档 title 由 pageSeo / seo 运行时统一管理；此处只同步 locale 状态
    // 语言切换时派发事件，让路由层可按需重算页面 SEO
    const unsubLocale = subscribeLocale((next) => {
      setLocaleState(next);
      window.dispatchEvent(new CustomEvent('pb:locale-change', { detail: next }));
    });
    return () => {
      unsubLocale();
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales: UI_LOCALES,
      setLocale,
      t,
      meta: LOCALE_META,
    }),
    [locale, setLocale, t],
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
