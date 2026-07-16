import { useEffect, useState, type ReactNode } from 'react';
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
import { PlayerProvider } from './player/PlayerContext';

type Gate = 'checking' | 'setup' | 'login' | 'app';

export default function App() {
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
          setGate('login');
          if (route.name !== 'login') navigate({ name: 'login' });
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
          setGate('login');
          if (route.name !== 'login') navigate({ name: 'login' });
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

  // 已进入 app 后，若手动跳到 setup/login 则纠正
  useEffect(() => {
    if (gate === 'setup' && route.name !== 'setup') {
      navigate({ name: 'setup' });
    } else if (gate === 'login' && route.name !== 'login') {
      navigate({ name: 'login' });
    } else if (
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
          <div className="auth-loading">正在启动…</div>
        </div>
      </div>
    );
  } else if (gate === 'setup' || route.name === 'setup') {
    page = <SetupPage />;
  } else if (gate === 'login' || route.name === 'login') {
    page = <LoginPage />;
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
    gate === 'app' &&
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
