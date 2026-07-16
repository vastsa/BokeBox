import type { ReactNode } from 'react';
import { IconDashboard, IconHeadphones } from '../components/icons';
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
  const listenActive = route.name === 'listen' || route.name === 'player';
  const adminActive =
    route.name === 'admin' ||
    route.name === 'admin-upload' ||
    route.name === 'admin-job';

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="page-container flex items-center justify-between gap-3 py-1.5">
          <button
            type="button"
            onClick={() => navigate({ name: 'listen' })}
            className="flex min-h-[36px] items-center gap-2"
          >
            <span className="brand-mark">
              <IconHeadphones size={15} />
            </span>
            <span className="text-left">
              <span className="block text-[14.5px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">
                Person Boke
              </span>
              <span className="mt-0.5 hidden text-[10.5px] text-[var(--text-3)] sm:block">
                私人视频转播客
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-0.5 rounded-full border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-0.5 backdrop-blur md:flex">
            <TopNavItem
              active={listenActive}
              label="听播"
              onClick={() => navigate({ name: 'listen' })}
              icon={<IconHeadphones size={14} />}
            />
            <TopNavItem
              active={adminActive}
              label="后台"
              onClick={() => navigate({ name: 'admin' })}
              icon={<IconDashboard size={14} />}
            />
          </nav>
        </div>
      </header>

      <main className={hideBottomNav ? 'pb-8' : 'page-bottom-pad'}>{children}</main>

      {!hideBottomNav && (
        <nav className="bottom-nav" aria-label="主导航">
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-0.5">
            <BottomNavItem
              active={listenActive}
              label="听播"
              onClick={() => navigate({ name: 'listen' })}
              icon={<IconHeadphones size={18} />}
            />
            <BottomNavItem
              active={adminActive}
              label="后台"
              onClick={() => navigate({ name: 'admin' })}
              icon={<IconDashboard size={18} />}
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
