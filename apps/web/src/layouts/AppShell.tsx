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
import { OpenSourceMark } from '../components/OpenSourceMark';
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

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="page-container flex items-center justify-between gap-3 py-1.5">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' })}
            className="flex min-h-[36px] items-center gap-2"
          >
            <BrandMark size={32} />
            <span className="text-left">
              <span className="block text-[14.5px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">
                {siteTitle}
              </span>
              <span className="mt-0.5 hidden text-[10.5px] text-[var(--text-3)] sm:block">
                {t('app.tagline')}
              </span>
            </span>
          </button>

          <nav className="topbar-nav hidden items-center gap-0.5 rounded-full border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-0.5 backdrop-blur md:flex">
            <TopNavItem
              active={homeActive}
              label={t('nav.home')}
              onClick={() => navigate({ name: 'home' })}
              icon={<IconLibrary size={14} />}
            />
            <TopNavItem
              active={tagsActive}
              label={t('nav.tags')}
              onClick={() => navigate({ name: 'tags' })}
              onIntent={prefetchTagCloud}
              icon={<IconStars size={14} />}
            />
            <TopNavItem
              active={albumsActive}
              label={t('nav.albums')}
              onClick={() => navigate({ name: 'albums' })}
              onIntent={prefetchAlbums}
              icon={<IconAlbum size={14} />}
            />
            {!isGuest && (
              <TopNavItem
                active={createActive}
                label={t('nav.create')}
                onClick={() => navigate({ name: 'admin' })}
                onIntent={prefetchCreate}
                icon={<IconUpload size={14} />}
              />
            )}
            {!isGuest ? (
              <TopNavItem
                active={settingsActive}
                label={t('nav.settings')}
                onClick={() => navigate({ name: 'settings' })}
                onIntent={prefetchSettings}
                icon={<IconSpark size={14} />}
              />
            ) : (
              <TopNavItem
                active={false}
                label={t('auth.login')}
                onClick={() => navigate({ name: 'login' })}
                icon={<IconSpark size={14} />}
              />
            )}
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
              <IconGitHub size={18} className="topbar-oss-icon" />
            </a>
            <div className="topbar-actions md:hidden">
              {!isGuest && (
                <TopActionButton
                  active={createActive}
                  label={t('nav.create')}
                  onClick={() => navigate({ name: 'admin' })}
                  onIntent={prefetchCreate}
                  icon={<IconUpload size={15} />}
                />
              )}
              {!isGuest ? (
                <TopActionButton
                  active={settingsActive}
                  label={t('nav.settings')}
                  onClick={() => navigate({ name: 'settings' })}
                  onIntent={prefetchSettings}
                  icon={<IconSpark size={15} />}
                />
              ) : (
                <TopActionButton
                  active={false}
                  label={t('auth.login')}
                  onClick={() => navigate({ name: 'login' })}
                  icon={<IconSpark size={15} />}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={hideBottomNav ? 'pb-8' : 'page-bottom-pad'}>{children}</main>

      {!hideBottomNav && (
        <nav className="bottom-nav" aria-label={t('nav.main')}>
          <div
            className={[
              'mx-auto grid max-w-md gap-0.5',
              isGuest ? 'grid-cols-4' : 'grid-cols-5',
            ].join(' ')}
          >
            <BottomNavItem
              active={homeActive}
              label={t('nav.home')}
              onClick={() => navigate({ name: 'home' })}
              icon={<IconLibrary size={18} />}
            />
            <BottomNavItem
              active={tagsActive}
              label={t('nav.tags')}
              onClick={() => navigate({ name: 'tags' })}
              onIntent={prefetchTagCloud}
              icon={<IconStars size={18} />}
            />
            <BottomNavItem
              active={albumsActive}
              label={t('nav.albums')}
              onClick={() => navigate({ name: 'albums' })}
              onIntent={prefetchAlbums}
              icon={<IconAlbum size={18} />}
            />
            {!isGuest && (
              <BottomNavItem
                active={createActive}
                label={t('nav.create')}
                onClick={() => navigate({ name: 'admin' })}
                onIntent={prefetchCreate}
                icon={<IconUpload size={18} />}
              />
            )}
            {!isGuest ? (
              <BottomNavItem
                active={settingsActive}
                label={t('nav.settings')}
                onClick={() => navigate({ name: 'settings' })}
                onIntent={prefetchSettings}
                icon={<IconSpark size={18} />}
              />
            ) : (
              <BottomNavItem
                active={false}
                label={t('auth.login')}
                onClick={() => navigate({ name: 'login' })}
                icon={<IconSpark size={18} />}
              />
            )}
          </div>
        </nav>
      )}

      <footer className="open-source-shell" role="contentinfo">
        <OpenSourceMark compact />
      </footer>
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
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      className={[
        'topbar-nav-item inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition',
        active
          ? 'is-active bg-[var(--brand-soft)] text-[var(--brand-2)]'
          : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {icon}
      {label}
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
      {icon}
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
      className={[
        'bottom-nav-item flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10.5px] font-semibold transition',
        active ? 'is-active bg-[var(--brand-soft)] text-[var(--brand-2)]' : 'text-[var(--text-3)]',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
