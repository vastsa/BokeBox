import { useEffect, useState, type ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import {
  IconAlbum,
  IconGitHub,
  IconLibrary,
  IconSpark,
  IconStars,
  IconUpload,
} from '../components/icons';
import { useI18n } from '../i18n';
import { PROJECT_GITHUB_URL } from '../lib/project';
import { getToken } from '../lib/auth';
import {
  formatSiteTitle,
  getCachedSiteName,
  subscribeSiteName,
} from '../lib/site';
import { navigate, type Route } from '../lib/router';

function prefetchTagCloud() {
  void import('../pages/TagCloudPage');
  // 星图 three.js 体积大，悬停预取独立 chunk
  void import('../components/tags/TagUniverse');
}

function prefetchAlbums() {
  void import('../pages/AlbumsPage');
}

function prefetchCreate() {
  void import('../pages/AdminPage');
}

function prefetchSettings() {
  void import('../pages/SettingsPage');
}

type NavItemDef = {
  id: string;
  active: boolean;
  label: string;
  onClick: () => void;
  onIntent?: () => void;
  icon: ReactNode;
};

export function AppShell({
  route,
  children,
  hideBottomNav = false,
}: {
  route: Route;
  children: ReactNode;
  hideBottomNav?: boolean;
}) {
  const isGuest = !getToken();
  const [siteName, setSiteName] = useState(() => getCachedSiteName());
  const siteTitle = formatSiteTitle(siteName);

  const { t } = useI18n();

  useEffect(() => subscribeSiteName(setSiteName), []);
  const homeActive =
    route.name === 'home' ||
    route.name === 'listen' ||
    route.name === 'player';
  const tagsActive = route.name === 'tags';
  const albumsActive = route.name === 'albums' || route.name === 'album';
  const createActive =
    route.name === 'create' ||
    route.name === 'admin-upload' ||
    route.name === 'admin' ||
    route.name === 'job' ||
    route.name === 'admin-job';
  const settingsActive = route.name === 'settings';

  const primaryItems: NavItemDef[] = [
    {
      id: 'home',
      active: homeActive,
      label: t('nav.home'),
      onClick: () => navigate({ name: 'home' }),
      icon: <IconLibrary size={16} />,
    },
    {
      id: 'tags',
      active: tagsActive,
      label: t('nav.tags'),
      onClick: () => navigate({ name: 'tags' }),
      onIntent: prefetchTagCloud,
      icon: <IconStars size={16} />,
    },
    {
      id: 'albums',
      active: albumsActive,
      label: t('nav.albums'),
      onClick: () => navigate({ name: 'albums' }),
      onIntent: prefetchAlbums,
      icon: <IconAlbum size={16} />,
    },
  ];

  const authItems: NavItemDef[] = !isGuest
    ? [
        {
          id: 'create',
          active: createActive,
          label: t('nav.create'),
          onClick: () => navigate({ name: 'admin' }),
          onIntent: prefetchCreate,
          icon: <IconUpload size={16} />,
        },
        {
          id: 'settings',
          active: settingsActive,
          label: t('nav.settings'),
          onClick: () => navigate({ name: 'settings' }),
          onIntent: prefetchSettings,
          icon: <IconSpark size={16} />,
        },
      ]
    : [
        {
          id: 'login',
          active: false,
          label: t('auth.login'),
          onClick: () => navigate({ name: 'login' }),
          icon: <IconSpark size={16} />,
        },
      ];

  const allItems = [...primaryItems, ...authItems];

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner page-container">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' })}
            className="topbar-brand"
          >
            <span className="topbar-brand-mark">
              <BrandMark size={30} />
            </span>
            <span className="topbar-brand-copy">
              <span className="app-brand-title">{siteTitle}</span>
              <span className="app-brand-tagline">{t('app.tagline')}</span>
            </span>
          </button>

          <nav className="topbar-nav" aria-label={t('nav.main')}>
            <div className="topbar-nav-track" role="list">
              {allItems.map((item) => (
                <TopNavItem key={item.id} {...item} />
              ))}
            </div>
          </nav>

          <div className="topbar-end">
            <a
              className="topbar-oss-link"
              href={PROJECT_GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              title={t('app.openSourceHint')}
              aria-label={`${t('app.openSourceBadge')} · ${t('app.github')}`}
            >
              <IconGitHub size={17} className="topbar-oss-icon" />
            </a>
            <div className="topbar-actions">
              {authItems.map((item) => (
                <TopActionButton
                  key={item.id}
                  active={item.active}
                  label={item.label}
                  onClick={item.onClick}
                  onIntent={item.onIntent}
                  icon={item.icon}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className={hideBottomNav ? 'pb-8' : 'page-bottom-pad'}>{children}</main>

      {!hideBottomNav && (
        <nav className="bottom-nav" aria-label={t('nav.main')}>
          <div
            className={[
              'bottom-nav-track',
              isGuest ? 'is-guest' : 'is-authed',
            ].join(' ')}
          >
            {allItems.map((item) => (
              <BottomNavItem key={item.id} {...item} />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function TopNavItem({
  active,
  label,
  onClick,
  onIntent,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onIntent?: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      aria-current={active ? 'page' : undefined}
      className={['topbar-nav-item', active ? 'is-active' : ''].join(' ')}
    >
      <span className="topbar-nav-icon" aria-hidden>
        {icon}
      </span>
      <span className="topbar-nav-label">{label}</span>
    </button>
  );
}

function TopActionButton({
  active,
  label,
  onClick,
  onIntent,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onIntent?: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      aria-label={label}
      title={label}
      className={['topbar-action-btn', active ? 'is-active' : ''].join(' ')}
    >
      <span className="topbar-action-icon" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function BottomNavItem({
  active,
  label,
  onClick,
  onIntent,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onIntent?: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      aria-current={active ? 'page' : undefined}
      className={['bottom-nav-item', active ? 'is-active' : ''].join(' ')}
    >
      <span className="bottom-nav-icon" aria-hidden>
        {icon}
        {active ? <span className="bottom-nav-dot" /> : null}
      </span>
      <span className="bottom-nav-label">{label}</span>
    </button>
  );
}
