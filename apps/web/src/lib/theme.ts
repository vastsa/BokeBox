export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const STORAGE_KEY = 'pb-theme';
const LIGHT_THEME_COLOR = '#f6f8fc';
const DARK_THEME_COLOR = '#0a0d12';

type ThemeListener = (theme: ThemePreference) => void;

const listeners = new Set<ThemeListener>();

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function detectSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 读取用户主题偏好；缺省或无效时跟随系统 */
export function getThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'system';
}

/** 将偏好解析为实际亮/深色 */
export function resolveThemeMode(preference: ThemePreference = getThemePreference()): ThemeMode {
  return preference === 'system' ? detectSystemTheme() : preference;
}

function updateThemeColorMeta(mode: ThemeMode) {
  const color = mode === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
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
    apple.setAttribute('content', mode === 'dark' ? 'black-translucent' : 'default');
  }
}

function notify(theme: ThemePreference) {
  listeners.forEach((listener) => listener(theme));
}

function stopSystemThemeWatch() {
  if (!mediaQuery || !mediaListener) return;
  if (typeof mediaQuery.removeEventListener === 'function') {
    mediaQuery.removeEventListener('change', mediaListener);
  } else {
    // 兼容旧版 Safari
    mediaQuery.removeListener(mediaListener);
  }
  mediaQuery = null;
  mediaListener = null;
}

function startSystemThemeWatch() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  stopSystemThemeWatch();
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = () => {
    if (getThemePreference() !== 'system') return;
    applyTheme('system');
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', mediaListener);
  } else {
    mediaQuery.addListener(mediaListener);
  }
}

/** 应用主题到 html[data-theme]；system 会解析为当前系统亮暗 */
export function applyTheme(preference: ThemePreference = getThemePreference()): ThemePreference {
  const mode = resolveThemeMode(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
  updateThemeColorMeta(mode);

  if (preference === 'system') {
    startSystemThemeWatch();
  } else {
    stopSystemThemeWatch();
  }

  notify(preference);
  return preference;
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
