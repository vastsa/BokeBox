import type { ReactNode } from 'react';
import { IconDashboard, IconUpload } from '../icons';
import { PageHeader } from '../ui/PageHeader';
import { useI18n } from '../../i18n';
import { navigate, type Route } from '../../lib/router';

type AdminTab = 'library' | 'create' | 'job';

function resolveTab(route: Route): AdminTab {
  if (route.name === 'create' || route.name === 'admin-upload') return 'create';
  if (route.name === 'job' || route.name === 'admin-job') return 'job';
  return 'library';
}

/**
 * 后台管理统一壳：任务库 / 新建 二级导航 + 统一页头。
 * 用于任务管理、上传、任务详情三页对齐。
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
  const tab = resolveTab(route);

  return (
    <div className="page-container app-page admin-console nl-enter">
      <div className="admin-chrome">
        <div className="admin-chrome-bar">
          <nav className="admin-chrome-tabs" aria-label={t('admin.chromeAria')}>
            <button
              type="button"
              className={[
                'admin-chrome-tab',
                tab === 'library' || tab === 'job' ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => navigate({ name: 'admin' })}
            >
              <IconDashboard size={14} />
              <span>{t('admin.library')}</span>
            </button>
            <button
              type="button"
              className={[
                'admin-chrome-tab',
                tab === 'create' ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => navigate({ name: 'create' })}
            >
              <IconUpload size={14} />
              <span>{t('admin.newJob')}</span>
            </button>
          </nav>
          {tab === 'job' && (
            <button
              type="button"
              className="admin-chrome-back"
              onClick={() => navigate({ name: 'admin' })}
            >
              {t('admin.backToLibrary')}
            </button>
          )}
        </div>

        <PageHeader title={title} subtitle={subtitle} actions={actions} />
      </div>

      <div className="admin-console-body">{children}</div>
    </div>
  );
}
