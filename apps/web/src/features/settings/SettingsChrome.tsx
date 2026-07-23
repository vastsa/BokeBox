import type { ReactNode } from 'react';

export type SettingsTab =
  | 'voice'
  | 'persona'
  | 'prompts'
  | 'ai'
  | 'sources'
  | 'schedules'
  | 'mcp'
  | 'site'
  | 'account';

export function SettingsPanel({
  id,
  active,
  children,
}: {
  id: SettingsTab;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      className="settings-tab-panel"
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-labelledby={`settings-tab-${id}`}
    >
      {children}
    </div>
  );
}

export function SettingsCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={['settings-card', 'settings-card-wide', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </section>
  );
}

export function SettingsBlock({
  title,
  desc,
  children,
  bare = false,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={bare ? 'settings-block is-bare' : 'settings-block'}>
      <div className="settings-block-head">
        <h3>{title}</h3>
        {desc ? <p>{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}
