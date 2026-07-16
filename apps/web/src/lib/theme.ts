export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'pb-theme';
const LIGHT_THEME_COLOR = '#f6f8fc';
const DARK_THEME_COLOR = '#0a0d12';

type ThemeListener = (state: {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}) => void;

type MediaQueryListLegacy = MediaQueryList & {
  addListener?: (cb: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (cb: (event: MediaQueryListEvent) => void) => void;
};

const listeners = new Set<ThemeListener>();

let media: MediaQueryList | null = null;
let unbindMedia: (() => void) | null = null;
let unbindLifecycle: (() => void) | null = null;

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

function bindMediaChange(target: MediaQueryList, handler: (event: MediaQueryListEvent) => void) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('change', handler);
    return () => target.removeEventListener('change', handler);
  }
  const legacy = target as MediaQueryListLegacy;
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}

/**
 * system 模式下 CSS 通过 prefers-color-scheme 原生换肤；
 * 这里只同步 meta / color-scheme / 订阅者。
 */
function syncResolvedChrome(preference: ThemePreference = getThemePreference()) {
  if (preference !== 'system') return;
  const resolved = getSystemTheme();
  const root = document.documentElement;
  // 保持 color-scheme 跟随当前系统解析，表单控件更准确
  root.style.colorScheme = resolved;
  updateThemeColorMeta(resolved);
  notify(preference, resolved);
}

function ensureSystemListener(preference: ThemePreference) {
  if (typeof window === 'undefined') return;

  if (unbindMedia) {
    unbindMedia();
    unbindMedia = null;
  }
  if (unbindLifecycle) {
    unbindLifecycle();
    unbindLifecycle = null;
  }

  if (preference !== 'system' || typeof window.matchMedia !== 'function') return;

  media = window.matchMedia('(prefers-color-scheme: dark)');
  unbindMedia = bindMediaChange(media, () => {
    syncResolvedChrome('system');
  });

  const onVisibility = () => {
    if (document.visibilityState === 'visible') syncResolvedChrome('system');
  };
  const onFocus = () => syncResolvedChrome('system');
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  unbindLifecycle = () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * 应用主题偏好。
 * - data-theme 写入 preference 本身（system | light | dark）
 * - system：CSS media 原生跟随系统；JS 只同步 meta
 * - light/dark：强制固定外观
 */
export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  root.setAttribute('data-theme', preference);
  // system 交给 CSS light dark；强制模式写死
  if (preference === 'system') {
    root.style.colorScheme = resolved;
  } else {
    root.style.colorScheme = preference;
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
  listener({
    preference: getThemePreference(),
    resolved: resolveTheme(),
  });
  return () => {
    listeners.delete(listener);
  };
}

/** 启动时初始化主题 */
export function initTheme(): ResolvedTheme {
  return applyTheme(getThemePreference());
}
