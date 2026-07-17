import type { ReactNode } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { useI18n } from '../../i18n';
import { navigate, type Route } from '../../lib/router';

/**
 * 后台管理统一壳：统一页头 + 内容区。
 * 任务库 / 新建任务切换走顶栏「制作台」与页头右侧主按钮，不再使用二级 Tab。
 */
export function AdminChrome({
  route,
  title,
  subtitle,
  actions,
  children,
}: {
  route: Route;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const isJobDetail = route.name === 'job' || route.name === 'admin-job';

  // 详情页默认提供返回任务库；调用方 actions 追加在其后
  const headerActions = (
    <>
      {isJobDetail ? (
        <button
          type="button"
          className="nl-btn nl-btn-ghost"
          onClick={() => navigate({ name: 'admin' })}
        >
          {t('admin.backToLibrary')}
        </button>
      ) : null}
      {actions}
    </>
  );

  const hasActions = Boolean(isJobDetail || actions);

  return (
    <div className="page-container app-page admin-console nl-enter">
      <div className="admin-chrome">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={hasActions ? headerActions : undefined}
        />
      </div>

      <div className="admin-console-body">{children}</div>
    </div>
  );
}
