import {
  buildPublicSiteSeo,
  type PublicSiteSeo,
} from '../services/settings/index.js';
import { getAlbum, getAlbumListenDetail } from '../services/album/albumStore.js';
import {
  getJob,
  isPubliclyListenable,
} from '../services/job/jobStore.js';

export type ResolvedPageSeo = {
  seo: PublicSiteSeo;
  /** 规范化 path */
  path: string;
  imagePath?: string | null;
  noIndex?: boolean;
  ogType?: string;
};

function normalizePath(pathname: string): string {
  let p = (pathname || '/').split('?')[0].split('#')[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p === '/' || p === '/index.html') return '/home';
  return p;
}

function joinTitle(page: string, site: PublicSiteSeo): string {
  const brand = site.title;
  const t = page.trim();
  if (!t) return brand;
  if (t === brand) return brand;
  return `${t} · ${brand}`;
}

function withPage(
  site: PublicSiteSeo,
  pageTitle: string,
  pageDescription: string,
  extraKeywords: string[] = [],
): PublicSiteSeo {
  const title = joinTitle(pageTitle, site);
  const baseDesc = pageDescription.trim();
  const description = baseDesc
    ? `${baseDesc} · ${site.attribution}`
    : site.description;
  let keywords = site.keywords;
  if (extraKeywords.length) {
    const parts = [
      ...keywords.split(/[,，、]/).map((x) => x.trim()),
      ...extraKeywords,
    ].filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    keywords = out.join(', ').slice(0, 200);
  }
  return { ...site, title, description, keywords };
}

type StaticPage = {
  title: string;
  description: string;
  noIndex?: boolean;
};

const STATIC: Record<string, StaticPage> = {
  '/home': {
    title: '听播库',
    description: '浏览私人 AI 播客库，继续收听已制作的节目。',
  },
  '/tags': {
    title: '标签星图',
    description: '在交互星图中按标签探索节目主题。',
  },
  '/albums': {
    title: '专辑',
    description: '浏览已发布专辑与连续收听队列。',
  },
  '/create': {
    title: '制作台',
    description: '将视频、链接、文稿转化为私人播客。',
    noIndex: true,
  },
  '/studio': {
    title: '工作台',
    description: '管理制作任务与流水线状态。',
    noIndex: true,
  },
  '/settings': {
    title: '设置',
    description: '站点、模型、插件、订阅与账户偏好。',
    noIndex: true,
  },
  '/login': {
    title: '登录',
    description: '登录以管理你的私人 AI 播客工作室。',
  },
  '/setup': {
    title: '初始化',
    description: '创建管理员账户并配置 AI 服务。',
    noIndex: true,
  },
};

/**
 * 按前端 history path 解析页面 SEO（供 index.html 注入）。
 * 仅使用可公开数据：已发布节目 / 专辑；后台路径 noindex。
 */
export async function resolvePageSeoForPath(
  pathname: string,
): Promise<ResolvedPageSeo> {
  const path = normalizePath(pathname);
  const site = buildPublicSiteSeo();

  // /play/:id
  if (path.startsWith('/play/')) {
    const id = path.slice('/play/'.length).split('/')[0];
    if (id) {
      const job = await getJob(id);
      if (job && isPubliclyListenable(job)) {
        const title = job.podcast?.title || job.title || '节目';
        const desc =
          job.podcast?.summary ||
          job.podcast?.hostIntro ||
          '沉浸播放器：口播跟读、节目笔记与知识闪卡。';
        const tags = (job.podcast?.tags || []).slice(0, 8);
        return {
          seo: withPage(site, title, desc, tags),
          path,
          imagePath: job.podcast?.hasCoverImage
            ? `/api/jobs/${encodeURIComponent(id)}/cover?size=md`
            : null,
          ogType: 'music.song',
        };
      }
    }
    return {
      seo: withPage(site, '正在播放', '沉浸播放器：口播跟读、节目笔记与知识闪卡。'),
      path,
    };
  }

  // /albums/:id
  if (path.startsWith('/albums/')) {
    const id = path.slice('/albums/'.length).split('/')[0];
    if (id) {
      const album = await getAlbum(id);
      if (album && album.published) {
        let imagePath: string | null = null;
        if (album.hasOwnCoverImage) {
          imagePath = `/api/listen/albums/${encodeURIComponent(id)}/cover?size=md`;
        } else {
          const detail = await getAlbumListenDetail(id, { authed: false });
          const coverJobId =
            detail?.resolvedCoverJobId ||
            detail?.coverJobId ||
            detail?.items[0]?.job.id ||
            null;
          if (coverJobId) {
            imagePath = `/api/jobs/${encodeURIComponent(coverJobId)}/cover?size=md`;
          }
        }
        return {
          seo: withPage(
            site,
            album.title || '专辑',
            album.summary || '专辑简介与曲目列表。',
            ['专辑'],
          ),
          path,
          imagePath,
          ogType: 'music.album',
        };
      }
    }
    return {
      seo: withPage(site, '专辑详情', '专辑简介与曲目列表。'),
      path,
    };
  }

  // 后台任务详情：noindex
  if (path.startsWith('/jobs/')) {
    return {
      seo: withPage(site, '任务详情', '流水线进度、节目资产与重处理。'),
      path,
      noIndex: true,
    };
  }

  const staticPage = STATIC[path];
  if (staticPage) {
    return {
      seo: withPage(site, staticPage.title, staticPage.description),
      path,
      noIndex: staticPage.noIndex,
    };
  }

  // 兼容旧路径
  if (path === '/listen' || path === '/') {
    return {
      seo: withPage(site, STATIC['/home']!.title, STATIC['/home']!.description),
      path: '/home',
    };
  }

  return { seo: site, path };
}
