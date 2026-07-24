import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { GlobalPlayerBar } from './components/listen/GlobalPlayerBar';
import { fetchMe, fetchSetupStatus, logout } from './api/client';
import { clearAuthSession, getToken } from './lib/auth';
import { setCachedSiteName } from './lib/site';
import { setCachedSeo } from './lib/seo';
import { applyRouteSeo } from './lib/pageSeo';
import {
  migrateLegacyHashRoute,
  navigate,
  parsePath,
  type Route,
  resetWindowScroll,
} from './lib/router';
import { ListenHomePage } from './pages/ListenHomePage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { useI18n } from './i18n';
import { PlayerProvider } from './player/PlayerContext';
import { StarMapLoader } from './components/tags/StarMapLoader';
import { PageLoader } from './components/ui/PageLoader';

const TagCloudPage = lazy(() =>
  import('./pages/TagCloudPage').then((m) => ({ default: m.TagCloudPage })),
);
const AdminJobPage = lazy(() =>
  import('./pages/AdminJobPage').then((m) => ({ default: m.AdminJobPage })),
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const AdminUploadPage = lazy(() =>
  import('./pages/AdminUploadPage').then((m) => ({ default: m.AdminUploadPage })),
);
const AlbumsPage = lazy(() =>
  import('./pages/AlbumsPage').then((m) => ({ default: m.AlbumsPage })),
);
const AlbumDetailPage = lazy(() =>
  import('./pages/AlbumDetailPage').then((m) => ({ default: m.AlbumDetailPage })),
);
const ListenPlayerPage = lazy(() =>
  import('./pages/ListenPlayerPage').then((m) => ({ default: m.ListenPlayerPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

type Gate = 'checking' | 'setup' | 'login' | 'guest' | 'app';

/** 游客模式下可访问的浏览路由（不含制作 / 设置） */
function isGuestAllowedRoute(name: Route['name']): boolean {
  return (
    name === 'home' ||
    name === 'listen' ||
    name === 'player' ||
    name === 'tags' ||
    name === 'albums' ||
    name === 'album'
  );
}

export default function App() {
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>(() => parsePath());
  const [gate, setGate] = useState<Gate>('checking');

  useEffect(() => {
    // 旧版 #/path → /path（history 模式）
    migrateLegacyHashRoute();
    setRoute(parsePath());

    const onPop = () => setRoute(parsePath());
    window.addEventListener('popstate', onPop);
    // 根路径规范化为 /home，便于分享与 SEO 一致
    const path = window.location.pathname || '/';
    if (path === '/' || path === '') {
      navigate({ name: 'home' }, { replace: true });
    }
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 星图是深色全屏页：在懒加载 chunk 前就把 html/body 底色切黑，避免亮色主题闪白
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.route = route.name;
    return () => {
      if (root.dataset.route === route.name) {
        delete root.dataset.route;
      }
    };
  }, [route.name]);

  // 路由切换回顶：长页（专辑）滚到底再进星图/播放器时，避免 scrollY 残留导致顶部裁切、底部空白
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    resetWindowScroll();
    // 下一帧再清一次，兜住布局锁 overflow 前后的残留
    const id = window.requestAnimationFrame(() => resetWindowScroll());
    return () => window.cancelAnimationFrame(id);
  }, [route]);

  // 静态路由 SEO；带内容的页面（播放/专辑/任务）会在数据到达后覆盖
  useEffect(() => {
    applyRouteSeo(route);
    const onLocale = () => applyRouteSeo(route);
    window.addEventListener('pb:locale-change', onLocale);
    return () => window.removeEventListener('pb:locale-change', onLocale);
  }, [route]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchSetupStatus();
        if (cancelled) return;
        if (status.siteName !== undefined || status.siteTitle !== undefined) {
          setCachedSiteName(status.siteName || '');
        }
        if (status.seo) {
          setCachedSeo(status.seo);
        }
        if (!status.initialized) {
          setGate('setup');
          if (route.name !== 'setup') navigate({ name: 'setup' });
          return;
        }

        const token = getToken();
        if (!token) {
          const guestOk = Boolean(status.guestHomePublic);
          const current = parsePath();
          if (guestOk) {
            // 开放游客首页：默认游客浏览；仅明确访问登录页时进入登录
            if (current.name === 'login') {
              setGate('login');
              return;
            }
            if (!isGuestAllowedRoute(current.name)) {
              setGate('guest');
              navigate({ name: 'home' });
              return;
            }
            setGate('guest');
            return;
          }
          setGate('login');
          if (current.name !== 'login') navigate({ name: 'login' });
          return;
        }

        try {
          await fetchMe();
          if (cancelled) return;
          setGate('app');
          if (route.name === 'setup' || route.name === 'login') {
            navigate({ name: 'home' });
          }
        } catch {
          if (cancelled) return;
          clearAuthSession();
          // 失效 token 时一并登出服务端 cookie 会话
          void logout();
          const guestOk = Boolean(status.guestHomePublic);
          const current = parsePath();
          if (guestOk) {
            if (current.name === 'login') {
              setGate('login');
              return;
            }
            if (!isGuestAllowedRoute(current.name)) {
              setGate('guest');
              navigate({ name: 'home' });
              return;
            }
            setGate('guest');
            return;
          }
          setGate('login');
          if (current.name !== 'login') navigate({ name: 'login' });
        }
      } catch {
        if (cancelled) return;
        // 后端不可达时，尽量让已有 token 进入 app 或落到登录
        if (getToken()) setGate('app');
        else setGate('login');
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅启动时检查；登录/初始化成功会主动 navigate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 路由与 gate 对齐：游客只开放浏览页；管理页强制登录
  useEffect(() => {
    if (gate === 'setup' && route.name !== 'setup') {
      navigate({ name: 'setup' });
      return;
    }
    if (gate === 'login' && route.name !== 'login') {
      navigate({ name: 'login' });
      return;
    }
    if (gate === 'guest') {
      if (route.name === 'setup') {
        navigate({ name: 'home' });
        return;
      }
      if (route.name === 'login') return;
      if (!isGuestAllowedRoute(route.name)) {
        navigate({ name: 'login' });
      }
      return;
    }
    if (
      gate === 'app' &&
      (route.name === 'setup' || route.name === 'login')
    ) {
      navigate({ name: 'home' });
    }
  }, [gate, route.name]);

  let page: ReactNode;
  if (gate === 'checking') {
    page = <PageLoader label={t('app.starting')} variant="screen" />;
  } else if (gate === 'setup' || route.name === 'setup') {
    page = <SetupPage />;
  } else if (gate === 'login' || route.name === 'login') {
    page = (
      <LoginPage
        onGuestBrowse={() => {
          // 进入游客前清理可能残留的登录态，确保前后端都按游客隔离
          clearAuthSession();
          void logout();
          setGate('guest');
          navigate({ name: 'home' });
        }}
      />
    );
  } else {
    switch (route.name) {
      case 'admin':
        page = <AdminPage route={route} />;
        break;
      case 'create':
      case 'admin-upload':
        page = <AdminUploadPage route={route} />;
        break;
      case 'job':
      case 'admin-job':
        page = <AdminJobPage id={route.id} route={route} />;
        break;
      case 'player':
        page = <ListenPlayerPage id={route.id} route={route} />;
        break;
      case 'tags':
        page = (
          <Suspense
            fallback={
              <div className="tc-page tc-page-boot" aria-busy="true">
                <div className="tc-universe">
                  <div className="tu-stage" aria-hidden>
                    <div className="tu-vignette" />
                    <div className="tu-aurora" />
                  </div>
                  <StarMapLoader label={t('tags.loading')} />
                </div>
              </div>
            }
          >
            <TagCloudPage route={route} />
          </Suspense>
        );
        break;
      case 'albums':
        page = <AlbumsPage route={route} />;
        break;
      case 'album':
        page = <AlbumDetailPage id={route.id} route={route} />;
        break;
      case 'settings':
        page = <SettingsPage route={route} />;
        break;
      case 'home':
      case 'listen':
      default:
        page = <ListenHomePage route={route} />;
        break;
    }
  }

  const showPlayer =
    (gate === 'app' || gate === 'guest') &&
    route.name !== 'setup' &&
    route.name !== 'login' &&
    route.name !== 'player';

  return (
    <PlayerProvider>
      <Suspense
        fallback={<PageLoader label={t('common.loading')} variant="screen" />}
      >
        {page}
      </Suspense>
      {showPlayer && <GlobalPlayerBar route={route} />}
    </PlayerProvider>
  );
}
