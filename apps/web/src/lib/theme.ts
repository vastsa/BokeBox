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
    return;
  }
  metas.forEach((meta) => {
    meta.setAttribute('content', color);
  });

  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) {
    apple.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
  }
}

function notify(preference: ThemePreference, resolved: ResolvedTheme) {
  const state = { preference, resolved };
  listeners.forEach((listener) => listener(state));
}

function ensureSystemListener(preference: ThemePreference) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

  if (!media) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
  }

  if (mediaHandler) {
    media.removeEventListener('change', mediaHandler);
    mediaHandler = null;
  }

  if (preference !== 'system') return;

  mediaHandler = () => {
    applyTheme(getThemePreference());
  };
  media.addEventListener('change', mediaHandler);
}

/** 应用主题：写入 html[data-theme]，并在 system 模式下跟随系统自动切换 */
export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
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
  return () => {
    listeners.delete(listener);
  };
}

/** 启动时初始化主题并开启 system 自动切换 */
export function initTheme(): ResolvedTheme {
  return applyTheme(getThemePreference());
}
