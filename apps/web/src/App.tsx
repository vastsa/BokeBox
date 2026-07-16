import { useEffect, useState, type ReactNode } from 'react';
import { GlobalPlayerBar } from './components/listen/GlobalPlayerBar';
import { AdminJobPage } from './pages/AdminJobPage';
import { AdminPage } from './pages/AdminPage';
import { AdminUploadPage } from './pages/AdminUploadPage';
import { ListenHomePage } from './pages/ListenHomePage';
import { ListenPlayerPage } from './pages/ListenPlayerPage';
import { parseHash, type Route } from './lib/router';
import { PlayerProvider } from './player/PlayerContext';

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) {
      window.location.hash = '/listen';
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let page: ReactNode;
  switch (route.name) {
    case 'admin':
      page = <AdminPage route={route} />;
      break;
    case 'admin-upload':
      page = <AdminUploadPage route={route} />;
      break;
    case 'admin-job':
      page = <AdminJobPage id={route.id} route={route} />;
      break;
    case 'player':
      page = <ListenPlayerPage id={route.id} route={route} />;
      break;
    case 'listen':
    default:
      page = <ListenHomePage route={route} />;
      break;
  }

  return (
    <PlayerProvider>
      {page}
      <GlobalPlayerBar route={route} />
    </PlayerProvider>
  );
}
