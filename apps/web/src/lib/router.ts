export type Route =
  | { name: 'home' }
  | { name: 'tags' }
  | { name: 'albums' }
  | { name: 'album'; id: string }
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
  if (path === '/tags' || path === '/tagcloud' || path === '/stars') {
    return { name: 'tags' };
  }
  if (path === '/albums' || path === '/album') return { name: 'albums' };
  if (path === '/create' || path === '/upload') return { name: 'create' };
  if (path === '/studio' || path === '/admin' || path === '/jobs') {
    return { name: 'admin' };
  }

  if (path === '/' || path === '/home' || path === '/listen') {
    return { name: 'home' };
  }

  if (path.startsWith('/albums/')) {
    const id = path.slice('/albums/'.length).split('/')[0];
    if (id) return { name: 'album', id };
  }
  if (path.startsWith('/album/')) {
    const id = path.slice('/album/'.length).split('/')[0];
    if (id) return { name: 'album', id };
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
  if (path === '/admin') return { name: 'admin' };
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
      return '#/home';
    case 'admin':
      return '#/studio';
    case 'tags':
      return '#/tags';
    case 'albums':
      return '#/albums';
    case 'album':
      return `#/albums/${route.id}`;
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

/** 路由切换时重置窗口滚动，避免长页滚到底后进入全屏页（星图/播放器）卡在半空 */
export function resetWindowScroll() {
  const x = window.scrollX;
  const y = window.scrollY;
  if (x || y) {
    window.scrollTo(0, 0);
  }
  // 兼容部分 WebKit 把滚动挂在 root / body 上
  if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
  if (document.body.scrollTop) document.body.scrollTop = 0;
}

export function navigate(route: Route) {
  const next = toHash(route); // like #/tags
  const cur = window.location.hash || '#/';
  // 先复位，再改 hash，避免全屏 overflow:hidden 时仍保留旧 scrollY
  resetWindowScroll();
  if (cur === next) {
    // 同路由再次点击：仍确保回到顶部
    return;
  }
  window.location.hash = next.slice(1);
}
