import type { ReactNode } from 'react';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="nl-empty">
      <div className="nl-empty-icon mb-3" aria-hidden>
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-[var(--text-3)]">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
