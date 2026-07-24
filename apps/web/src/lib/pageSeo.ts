import { coverImageUrl, albumCoverUrl } from '../api/media';
import type { Route } from './router';
import { toPath } from './router';
import {
  applyDocumentHead,
  buildPageSeo,
  getCachedSeo,
  type PageSeoOverride,
  type PublicSiteSeo,
} from './seo';
import { getCachedSiteName, formatSiteTitle } from './site';

export type PageSeoCopy = {
  home: { title: string; description: string };
  tags: { title: string; description: string };
  albums: { title: string; description: string };
  album: { title: string; description: string; fallbackTitle: string };
  player: { title: string; description: string; fallbackTitle: string };
  create: { title: string; description: string };
  admin: { title: string; description: string };
  job: { title: string; description: string; fallbackTitle: string };
  settings: { title: string; description: string };
  login: { title: string; description: string };
  setup: { title: string; description: string };
};

/** 中英默认文案（不依赖 React i18n，便于路由层同步） */
export function defaultPageSeoCopy(locale?: string): PageSeoCopy {
  const en = (locale || '').toLowerCase().startsWith('en');
  if (en) {
    return {
      home: {
        title: 'Library',
        description: 'Browse your private AI podcast library and continue listening.',
      },
      tags: {
        title: 'Tag star map',
        description: 'Explore episodes by tags in an interactive star map.',
      },
      albums: {
        title: 'Albums',
        description: 'Browse published albums and continuous listening queues.',
      },
      album: {
        title: 'Album',
        description: 'Album detail and tracklist.',
        fallbackTitle: 'Album',
      },
      player: {
        title: 'Now playing',
        description: 'Immersive player with script follow, notes, and flashcards.',
        fallbackTitle: 'Episode',
      },
      create: {
        title: 'Create',
        description: 'Turn videos, links, and documents into private podcasts.',
      },
      admin: {
        title: 'Studio',
        description: 'Manage production jobs and pipeline status.',
      },
      job: {
        title: 'Job detail',
        description: 'Pipeline status, assets, and reprocess controls.',
        fallbackTitle: 'Job',
      },
      settings: {
        title: 'Settings',
        description: 'Site, models, plugins, schedules, and account preferences.',
      },
      login: {
        title: 'Sign in',
        description: 'Sign in to manage your private AI podcast studio.',
      },
      setup: {
        title: 'Initial setup',
        description: 'Create the admin account and configure AI providers.',
      },
    };
  }
  return {
    home: {
      title: '听播库',
      description: '浏览私人 AI 播客库，继续收听已制作的节目。',
    },
    tags: {
      title: '标签星图',
      description: '在交互星图中按标签探索节目主题。',
    },
    albums: {
      title: '专辑',
      description: '浏览已发布专辑与连续收听队列。',
    },
    album: {
      title: '专辑详情',
      description: '专辑简介与曲目列表。',
      fallbackTitle: '专辑',
    },
    player: {
      title: '正在播放',
      description: '沉浸播放器：口播跟读、节目笔记与知识闪卡。',
      fallbackTitle: '节目',
    },
    create: {
      title: '制作台',
      description: '将视频、链接、文稿转化为私人播客。',
    },
    admin: {
      title: '工作台',
      description: '管理制作任务与流水线状态。',
    },
    job: {
      title: '任务详情',
      description: '流水线进度、节目资产与重处理。',
      fallbackTitle: '任务',
    },
    settings: {
      title: '设置',
      description: '站点、模型、插件、订阅与账户偏好。',
    },
    login: {
      title: '登录',
      description: '登录以管理你的私人 AI 播客工作室。',
    },
    setup: {
      title: '初始化',
      description: '创建管理员账户并配置 AI 服务。',
    },
  };
}

function siteBrandTitle(siteSeo: PublicSiteSeo): string {
  // 页面标题后缀优先站点 SEO 标题，否则站点名 / 默认
  return siteSeo.title || formatSiteTitle(getCachedSiteName());
}

function joinTitle(pageTitle: string, siteSeo: PublicSiteSeo): string {
  const brand = siteBrandTitle(siteSeo);
  const page = pageTitle.trim();
  if (!page) return brand;
  if (page === brand || brand.startsWith(page)) return brand;
  // 「节目标题 · 站点标题」
  return `${page} · ${brand}`;
}

function absoluteMediaUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === 'undefined') return pathOrUrl;
  const origin = window.location.origin;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  // og:image 不带 access_token，避免泄露 token；公开封面接口可匿名
  try {
    const u = new URL(path, origin);
    u.searchParams.delete('access_token');
    return u.toString();
  } catch {
    return `${origin}${path}`;
  }
}

export type ContentSeoInput = {
  title?: string | null;
  description?: string | null;
  keywords?: string[] | string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  noIndex?: boolean;
};

/** 根据路由 + 可选内容构建页面 SEO */
export function buildRoutePageSeo(
  route: Route,
  content?: ContentSeoInput | null,
  copy: PageSeoCopy = defaultPageSeoCopy(
    typeof document !== 'undefined' ? document.documentElement.lang : 'zh-CN',
  ),
): PageSeoOverride {
  const site = getCachedSeo();
  const path = toPath(route);

  const staticMap: Record<string, { title: string; description: string }> = {
    home: copy.home,
    listen: copy.home,
    tags: copy.tags,
    albums: copy.albums,
    create: copy.create,
    'admin-upload': copy.create,
    admin: copy.admin,
    settings: copy.settings,
    login: copy.login,
    setup: copy.setup,
  };

  let pageTitle = '';
  let pageDesc = '';
  let keywordsExtra: string[] = [];
  let image: string | undefined;
  let noIndex = false;

  switch (route.name) {
    case 'player': {
      const title = content?.title?.trim() || copy.player.fallbackTitle;
      pageTitle = title;
      pageDesc =
        content?.description?.trim() ||
        `${copy.player.description}`;
      keywordsExtra = ['播客', '收听', 'BokeBox'];
      image = absoluteMediaUrl(content?.imageUrl || content?.imagePath);
      break;
    }
    case 'album': {
      const title = content?.title?.trim() || copy.album.fallbackTitle;
      pageTitle = title;
      pageDesc = content?.description?.trim() || copy.album.description;
      keywordsExtra = ['专辑', '播客', 'BokeBox'];
      image = absoluteMediaUrl(content?.imageUrl || content?.imagePath);
      break;
    }
    case 'job':
    case 'admin-job': {
      const title = content?.title?.trim() || copy.job.fallbackTitle;
      pageTitle = title;
      pageDesc = content?.description?.trim() || copy.job.description;
      keywordsExtra = ['任务', '制作', 'BokeBox'];
      image = absoluteMediaUrl(content?.imageUrl || content?.imagePath);
      noIndex = true; // 后台任务默认不索引
      break;
    }
    case 'create':
    case 'admin-upload':
    case 'admin':
    case 'settings':
    case 'setup':
    case 'login': {
      const s = staticMap[route.name]!;
      pageTitle = s.title;
      pageDesc = s.description;
      // 管理 / 初始化页不索引；登录页可索引
      noIndex = route.name !== 'login';
      break;
    }
    default: {
      const s = staticMap[route.name] || copy.home;
      pageTitle = s.title;
      pageDesc = s.description;
      break;
    }
  }

  if (content?.keywords) {
    if (Array.isArray(content.keywords)) keywordsExtra.push(...content.keywords);
    else keywordsExtra.push(content.keywords);
  }
  if (content?.noIndex) noIndex = true;

  return {
    title: joinTitle(pageTitle, site),
    description: pageDesc,
    keywords: keywordsExtra.filter(Boolean),
    path,
    imageUrl: image,
    noIndex,
  };
}

/** 应用路由级 SEO（可叠加内容字段） */
export function applyRouteSeo(
  route: Route,
  content?: ContentSeoInput | null,
  copy?: PageSeoCopy,
): PublicSiteSeo {
  const override = buildRoutePageSeo(route, content, copy);
  const page = buildPageSeo(override);
  applyDocumentHead(page, {
    path: override.path,
    imageUrl: override.imageUrl,
    noIndex: override.noIndex,
  });
  return page;
}

/** 从播客任务拼内容 SEO */
export function contentSeoFromJob(job: {
  id: string;
  title?: string;
  updatedAt?: string;
  podcast?: {
    title?: string;
    summary?: string;
    tags?: string[];
    hostIntro?: string;
    hasCoverImage?: boolean;
  } | null;
}): ContentSeoInput {
  const title = job.podcast?.title || job.title || '';
  const description =
    job.podcast?.summary || job.podcast?.hostIntro || '';
  const imagePath = job.podcast?.hasCoverImage
    ? coverImageUrl(job.id, job.updatedAt, 'md')
    : undefined;
  return {
    title,
    description,
    keywords: job.podcast?.tags || [],
    imagePath,
  };
}

/** 从专辑拼内容 SEO */
export function contentSeoFromAlbum(album: {
  id: string;
  title?: string;
  summary?: string;
  updatedAt?: string;
  hasOwnCoverImage?: boolean;
  hasCoverImage?: boolean;
  resolvedCoverJobId?: string | null;
  coverJobId?: string | null;
  items?: Array<{ job: { id: string; updatedAt?: string; podcast?: { hasCoverImage?: boolean } } }>;
}): ContentSeoInput {
  let imagePath: string | undefined;
  if (album.hasOwnCoverImage) {
    imagePath = albumCoverUrl(album.id, album.updatedAt, 'md');
  } else {
    const coverJobId =
      album.resolvedCoverJobId ||
      album.coverJobId ||
      album.items?.[0]?.job.id ||
      null;
    if (coverJobId) {
      const job = album.items?.find((x) => x.job.id === coverJobId)?.job;
      imagePath = coverImageUrl(coverJobId, job?.updatedAt || album.updatedAt, 'md');
    }
  }
  return {
    title: album.title || '',
    description: album.summary || '',
    imagePath,
  };
}
