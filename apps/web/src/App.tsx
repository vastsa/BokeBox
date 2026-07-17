import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { GlobalPlayerBar } from './components/listen/GlobalPlayerBar';
import { fetchMe, fetchSetupStatus } from './api/client';
import { clearAuthSession, getToken } from './lib/auth';
import { navigate, parseHash, type Route } from './lib/router';
import { AdminJobPage } from './pages/AdminJobPage';
import { AdminUploadPage } from './pages/AdminUploadPage';
import { ListenHomePage } from './pages/ListenHomePage';
import { ListenPlayerPage } from './pages/ListenPlayerPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { useI18n } from './i18n';
import { PlayerProvider } from './player/PlayerContext';

const TagCloudPage = lazy(() =>
  import('./pages/TagCloudPage').then((m) => ({ default: m.TagCloudPage })),
);

type Gate = 'checking' | 'setup' | 'login' | 'guest' | 'app';

/** 游客模式下可访问的浏览路由（不含制作 / 设置） */
function isGuestAllowedRoute(name: Route['name']): boolean {
  return (
    name === 'home' ||
    name === 'listen' ||
    name === 'admin' ||
    name === 'player' ||
    name === 'tags'
  );
}

export default function App() {
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [gate, setGate] = useState<Gate>('checking');

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) {
      window.location.hash = '/home';
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchSetupStatus();
        if (cancelled) return;
        if (!status.initialized) {
          setGate('setup');
          if (route.name !== 'setup') navigate({ name: 'setup' });
          return;
        }

        const token = getToken();
        if (!token) {
          const guestOk = Boolean(status.guestHomePublic);
          const current = parseHash();
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
          const guestOk = Boolean(status.guestHomePublic);
          const current = parseHash();
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
    page = (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-loading">{t('app.starting')}</div>
        </div>
      </div>
    );
  } else if (gate === 'setup' || route.name === 'setup') {
    page = <SetupPage />;
  } else if (gate === 'login' || route.name === 'login') {
    page = (
      <LoginPage
        onGuestBrowse={() => {
          setGate('guest');
          navigate({ name: 'home' });
        }}
      />
    );
  } else {
    switch (route.name) {
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
          <Suspense fallback={<div className="tc-page" />}>
            <TagCloudPage route={route} />
          </Suspense>
        );
        break;
      case 'settings':
        page = <SettingsPage route={route} />;
        break;
      case 'home':
      case 'listen':
      case 'admin':
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
      {page}
      {showPlayer && <GlobalPlayerBar route={route} />}
    </PlayerProvider>
  );
}
