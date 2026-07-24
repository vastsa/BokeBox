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
  // 兼容旧路径名（内部会重定向）
  | { name: 'listen' }
  | { name: 'admin' }
  | { name: 'admin-upload' }
  | { name: 'admin-job'; id: string };

/** 规范化路径：去 query/hash，保证前导 /，去掉尾部 /（根路径除外） */
function normalizePathname(input: string): string {
  let path = input || '/';
  // 去掉可能误带的 query / fragment
  path = path.split('?')[0]?.split('#')[0] || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

/** 将旧 hash 路由（#/tags）迁移为 history 路径（/tags） */
export function migrateLegacyHashRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  if (!hash || hash === '#' || hash === '#/') return false;
  // 仅迁移看起来像 path 的 hash：#/xxx 或 #xxx
  const raw = hash.replace(/^#/, '');
  if (!raw) return false;
  // 忽略纯锚点（不含 / 且不像已知路由）
  const path = normalizePathname(raw.startsWith('/') ? raw : `/${raw}`);
  const search = window.location.search || '';
  const nextUrl = `${path}${search}`;
  // 若当前 pathname 已是目标且只是残留 hash，直接清掉 hash
  if (normalizePathname(window.location.pathname) === path) {
    window.history.replaceState(null, '', nextUrl);
    return true;
  }
  // pathname 仍是 /（或任意）时，以 hash 内容为准
  window.history.replaceState(null, '', nextUrl);
  return true;
}

export function parsePath(pathname?: string): Route {
  const path = normalizePathname(
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
  );

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

/** @deprecated 使用 parsePath；保留别名避免遗漏引用 */
export function parseHash(): Route {
  return parsePath();
}

export function toPath(route: Route): string {
  switch (route.name) {
    case 'home':
    case 'listen':
      return '/home';
    case 'admin':
      return '/studio';
    case 'tags':
      return '/tags';
    case 'albums':
      return '/albums';
    case 'album':
      return `/albums/${route.id}`;
    case 'player':
      return `/play/${route.id}`;
    case 'create':
    case 'admin-upload':
      return '/create';
    case 'job':
    case 'admin-job':
      return `/jobs/${'id' in route ? route.id : ''}`;
    case 'settings':
      return '/settings';
    case 'setup':
      return '/setup';
    case 'login':
      return '/login';
  }
}

/** @deprecated 使用 toPath；返回不带 # 的路径 */
export function toHash(route: Route): string {
  return toPath(route);
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

export function navigate(route: Route, options?: { replace?: boolean }) {
  const next = toPath(route);
  const cur = normalizePathname(window.location.pathname);
  const search = window.location.search || '';
  // 先复位，再改 history，避免全屏 overflow:hidden 时仍保留旧 scrollY
  resetWindowScroll();
  if (cur === next) {
    // 同路由再次点击：仍确保回到顶部；顺手清掉残留 hash
    if (window.location.hash) {
      window.history.replaceState(null, '', `${next}${search}`);
    }
    return;
  }
  const url = `${next}${search}`;
  if (options?.replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  // 通知同页订阅者（App 监听 popstate 不够覆盖 pushState）
  window.dispatchEvent(new PopStateEvent('popstate'));
}
