export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = 'pb-theme';
const LIGHT_THEME_COLOR = '#f6f8fc';
const DARK_THEME_COLOR = '#0a0d12';

type ThemeListener = (theme: ThemePreference) => void;

const listeners = new Set<ThemeListener>();

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

function detectSystemTheme(): ThemePreference {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(raw)) return raw;
    // 兼容旧版 system：一次性固化为当前系统解析结果
    if (raw === 'system') {
      const migrated = detectSystemTheme();
      try {
        localStorage.setItem(STORAGE_KEY, migrated);
      } catch {
        // ignore
      }
      return migrated;
    }
  } catch {
    // ignore storage errors
  }
  return 'light';
}

function updateThemeColorMeta(theme: ThemePreference) {
  const color = theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
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
    apple.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
  }
}

function notify(theme: ThemePreference) {
  listeners.forEach((listener) => listener(theme));
}

/** 应用亮/深色主题到 html[data-theme] */
export function applyTheme(theme: ThemePreference = getThemePreference()): ThemePreference {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  updateThemeColorMeta(theme);
  notify(theme);
  return theme;
}

export function setThemePreference(theme: ThemePreference): ThemePreference {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
  return applyTheme(theme);
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  listener(getThemePreference());
  return () => {
    listeners.delete(listener);
  };
}

/** 启动时初始化主题 */
export function initTheme(): ThemePreference {
  return applyTheme(getThemePreference());
}
