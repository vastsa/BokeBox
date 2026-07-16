export type Route =
  | { name: 'home' }
  | { name: 'player'; id: string }
  | { name: 'create' }
  | { name: 'job'; id: string }
  | { name: 'settings' }
  | { name: 'setup' }
  | { name: 'login' }
  // 兼容旧 hash（内部会重定向）
  | { name: 'listen' }
  | { name: 'admin' }
  | { name: 'admin-upload' }
  | { name: 'admin-job'; id: string };

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;

  if (path === '/setup') return { name: 'setup' };
  if (path === '/login') return { name: 'login' };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/create' || path === '/upload') return { name: 'create' };

  if (path === '/' || path === '/home' || path === '/listen') {
    return { name: 'home' };
  }

  if (path.startsWith('/play/')) {
    const id = path.slice('/play/'.length).split('/')[0];
    if (id) return { name: 'player', id };
  }
  if (path.startsWith('/listen/')) {
    const id = path.slice('/listen/'.length).split('/')[0];
    if (id) return { name: 'player', id };
  }
  if (path.startsWith('/jobs/')) {
    const id = path.slice('/jobs/'.length).split('/')[0];
    if (id) return { name: 'job', id };
  }

  // 旧后台路径兼容
  if (path === '/admin') return { name: 'home' };
  if (path === '/admin/upload') return { name: 'create' };
  if (path.startsWith('/admin/jobs/')) {
    const id = path.slice('/admin/jobs/'.length).split('/')[0];
    if (id) return { name: 'job', id };
  }

  return { name: 'home' };
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'home':
    case 'listen':
    case 'admin':
      return '#/home';
    case 'player':
      return `#/play/${route.id}`;
    case 'create':
    case 'admin-upload':
      return '#/create';
    case 'job':
    case 'admin-job':
      return `#/jobs/${'id' in route ? route.id : ''}`;
    case 'settings':
      return '#/settings';
    case 'setup':
      return '#/setup';
    case 'login':
      return '#/login';
  }
}

export function navigate(route: Route) {
  window.location.hash = toHash(route).slice(1);
}
