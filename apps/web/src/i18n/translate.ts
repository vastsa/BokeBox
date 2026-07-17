import type { Locale } from './locale';
import { DEFAULT_UI_LOCALE, resolveUiLocale } from './locale';
import { enUS } from './messages/en-US';
import { zhCN, type MessageTree } from './messages/zh-CN';

export type Messages = MessageTree;
export type TranslateParams = Record<string, string | number | boolean | null | undefined>;

/** 点分路径，例如 settings.language */
export type MessageKey = PathKeys<Messages>;

type PathKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: PathKeys<
        T[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

const catalogs: Partial<Record<Locale, Messages>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export function getMessages(locale: Locale): Messages {
  const ui = resolveUiLocale(locale, DEFAULT_UI_LOCALE);
  return catalogs[ui] || zhCN;
}

function resolvePath(messages: Messages, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = messages;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(
  template: string,
  params?: TranslateParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === null || value === undefined) return `{${name}}`;
    return String(value);
  });
}

export function createTranslator(locale: Locale) {
  const messages = getMessages(resolveUiLocale(locale));
  function t(key: MessageKey | string, params?: TranslateParams): string {
    const raw =
      resolvePath(messages, key) ??
      resolvePath(zhCN, key) ??
      key;
    return interpolate(raw, params);
  }
  return t;
}

export type Translator = ReturnType<typeof createTranslator>;
