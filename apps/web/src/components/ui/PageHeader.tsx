import type { ReactNode } from 'react';

/**
 * 主站三页（首页 / 制作 / 设置）统一页头。
 * 视觉对齐听播首页：无英文 kicker、无返回条，标题 + 辅文 + 可选右侧操作。
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="app-page-head">
      <div className="app-page-head-copy">
        <h1 className="app-page-title">{title}</h1>
        {subtitle ? <p className="app-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="app-page-head-actions">{actions}</div>
      ) : null}
    </header>
  );
}
