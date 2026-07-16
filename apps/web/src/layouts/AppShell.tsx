import type { ReactNode } from 'react';
import {
  IconHeadphones,
  IconLibrary,
  IconSpark,
  IconUpload,
} from '../components/icons';
import { navigate, type Route } from '../lib/router';

export function AppShell({
  route,
  children,
  hideBottomNav = false,
}: {
  route: Route;
  children: ReactNode;
  hideBottomNav?: boolean;
}) {
  const homeActive =
    route.name === 'home' ||
    route.name === 'listen' ||
    route.name === 'admin' ||
    route.name === 'player' ||
    route.name === 'job' ||
    route.name === 'admin-job';
  const createActive =
    route.name === 'create' || route.name === 'admin-upload';
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
            <span className="brand-mark">
              <IconHeadphones size={15} />
            </span>
            <span className="text-left">
              <span className="block text-[14.5px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">
                BokeBox
              </span>
              <span className="mt-0.5 hidden text-[10.5px] text-[var(--text-3)] sm:block">
                私人视频转播客
              </span>
            </span>
          </button>

          {/* 桌面端：完整顶栏导航 */}
          <nav className="hidden items-center gap-0.5 rounded-full border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-0.5 backdrop-blur md:flex">
            <TopNavItem
              active={homeActive}
              label="首页"
              onClick={() => navigate({ name: 'home' })}
              icon={<IconLibrary size={14} />}
            />
            <TopNavItem
              active={createActive}
              label="制作"
              onClick={() => navigate({ name: 'create' })}
              icon={<IconUpload size={14} />}
            />
            <TopNavItem
              active={settingsActive}
              label="设置"
              onClick={() => navigate({ name: 'settings' })}
              icon={<IconSpark size={14} />}
            />
          </nav>

          {/* 手机端：右上角制作 / 设置 */}
          <div className="topbar-actions md:hidden">
            <TopActionButton
              active={createActive}
              label="制作"
              onClick={() => navigate({ name: 'create' })}
              icon={<IconUpload size={15} />}
            />
            <TopActionButton
              active={settingsActive}
              label="设置"
              onClick={() => navigate({ name: 'settings' })}
              icon={<IconSpark size={15} />}
            />
          </div>
        </div>
      </header>

      <main className={hideBottomNav ? 'pb-8' : 'page-bottom-pad'}>{children}</main>

      {!hideBottomNav && (
        <nav className="bottom-nav" aria-label="主导航">
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-0.5">
            <BottomNavItem
              active={homeActive}
              label="首页"
              onClick={() => navigate({ name: 'home' })}
              icon={<IconLibrary size={18} />}
            />
            <BottomNavItem
              active={createActive}
              label="制作"
              onClick={() => navigate({ name: 'create' })}
              icon={<IconUpload size={18} />}
            />
            <BottomNavItem
              active={settingsActive}
              label="设置"
              onClick={() => navigate({ name: 'settings' })}
              icon={<IconSpark size={18} />}
            />
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
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition',
        active
          ? 'bg-[var(--brand-soft)] text-[var(--brand-2)]'
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
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10.5px] font-semibold transition',
        active ? 'bg-[var(--brand-soft)] text-[var(--brand-2)]' : 'text-[var(--text-3)]',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
