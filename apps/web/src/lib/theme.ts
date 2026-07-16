export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'pb-theme';
const LIGHT_THEME_COLOR = '#f6f8fc';
const DARK_THEME_COLOR = '#0a0d12';

type ThemeListener = (state: {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}) => void;

let media: MediaQueryList | null = null;
let mediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
const listeners = new Set<ThemeListener>();

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'system';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

function updateThemeColorMeta(resolved: ResolvedTheme) {
  const color = resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
  } else {
    metas.forEach((meta) => {
      meta.setAttribute('content', color);
    });
  }

  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) {
    apple.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
  }
}

function notify(preference: ThemePreference, resolved: ResolvedTheme) {
  listeners.forEach((listener) => listener({ preference, resolved }));
}

function bindMediaChange(handler: (event: MediaQueryListEvent) => void, target: MediaQueryList) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('change', handler);
    return () => target.removeEventListener('change', handler);
  }
  // Safari < 14
  const legacy = target as MediaQueryList & {
    addListener?: (cb: (event: MediaQueryListEvent) => void) => void;
    removeListener?: (cb: (event: MediaQueryListEvent) => void) => void;
  };
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}

let unbindMedia: (() => void) | null = null;

function ensureSystemListener(preference: ThemePreference) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

  if (unbindMedia) {
    unbindMedia();
    unbindMedia = null;
  }
  mediaHandler = null;

  if (preference !== 'system') return;

  if (!media) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
  }

  mediaHandler = () => {
    // CSS 已通过 media 自动切换；这里同步 meta / color-scheme / 订阅者
    const resolved = getSystemTheme();
    document.documentElement.style.colorScheme = resolved;
    updateThemeColorMeta(resolved);
    notify('system', resolved);
  };
  unbindMedia = bindMediaChange(mediaHandler, media);
}

/**
 * 应用主题偏好。
 * - light/dark：写入固定 data-theme
 * - system：写入 data-theme="system"，由 CSS prefers-color-scheme 真正跟随系统
 */
export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  // 关键：保留 system，让 CSS media 自动跟随；手动模式才写死 light/dark
  root.setAttribute('data-theme', preference);
  root.style.colorScheme = preference === 'system' ? 'light dark' : resolved;

  // system 模式下浏览器会按 media 解析 color-scheme；同步 meta 用 resolved
  if (preference === 'system') {
    // 明确同步当前系统解析结果到 color-scheme，便于表单控件配色
    root.style.colorScheme = resolved;
  }

  updateThemeColorMeta(resolved);
  ensureSystemListener(preference);
  notify(preference, resolved);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore storage errors
  }
  return applyTheme(preference);
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  // 立即推送一次当前状态
  listener({
    preference: getThemePreference(),
    resolved: resolveTheme(),
  });
  return () => {
    listeners.delete(listener);
  };
}

/** 启动时初始化主题；system 模式依赖 CSS 媒体查询自动跟随 */
export function initTheme(): ResolvedTheme {
  return applyTheme(getThemePreference());
}
