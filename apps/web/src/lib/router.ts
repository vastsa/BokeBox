export type Route =
  | { name: 'listen' }
  | { name: 'player'; id: string }
  | { name: 'admin' }
  | { name: 'admin-upload' }
  | { name: 'admin-job'; id: string };

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path === '/' || path === '/listen') return { name: 'listen' };
  if (path.startsWith('/listen/')) {
    const id = path.slice('/listen/'.length).split('/')[0];
    if (id) return { name: 'player', id };
  }
  if (path === '/admin') return { name: 'admin' };
  if (path === '/admin/upload') return { name: 'admin-upload' };
  if (path.startsWith('/admin/jobs/')) {
    const id = path.slice('/admin/jobs/'.length).split('/')[0];
    if (id) return { name: 'admin-job', id };
  }
  return { name: 'listen' };
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'listen':
      return '#/listen';
    case 'player':
      return `#/listen/${route.id}`;
    case 'admin':
      return '#/admin';
    case 'admin-upload':
      return '#/admin/upload';
    case 'admin-job':
      return `#/admin/jobs/${route.id}`;
  }
}

export function navigate(route: Route) {
  window.location.hash = toHash(route).slice(1);
}
