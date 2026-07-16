import type { ReactNode } from 'react';

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
