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
let applying = false;

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

  // Safari < 14
  const legacy = target as MediaQueryListLegacy;
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}

function syncFromSystem() {
  if (getThemePreference() !== 'system') return;
  applyTheme('system');
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
    syncFromSystem();
  });

  // 部分环境从后台回到前台后 media change 可能丢失，补一次同步
  const onVisibility = () => {
    if (document.visibilityState === 'visible') syncFromSystem();
  };
  const onFocus = () => syncFromSystem();
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  unbindLifecycle = () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * 应用主题偏好。
 * - 视觉层始终写入 data-theme = light | dark（CSS 只认这两态）
 * - preference 单独存 data-theme-pref，供调试与设置页
 * - system 模式监听系统变更后重新 resolve 并写入
 */
export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  if (applying) {
    // 避免 media/focus 重入时重复通知；仍返回当前解析结果
    return resolveTheme(preference);
  }

  applying = true;
  try {
    const resolved = resolveTheme(preference);
    const root = document.documentElement;

    // 关键：视觉主题只写 light/dark，保证 html[data-theme="dark"] 规则稳定生效
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-pref', preference);
    root.style.colorScheme = resolved;

    updateThemeColorMeta(resolved);
    ensureSystemListener(preference);
    notify(preference, resolved);
    return resolved;
  } finally {
    applying = false;
  }
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

/** 启动时初始化主题；system 模式会监听系统外观变化 */
export function initTheme(): ResolvedTheme {
  return applyTheme(getThemePreference());
}
