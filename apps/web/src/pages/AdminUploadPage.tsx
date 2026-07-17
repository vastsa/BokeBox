import { UploadPanel } from '../components/admin/UploadPanel';
import { AdminChrome } from '../components/admin/AdminChrome';
import { navigate, type Route } from '../lib/router';
import { useI18n } from '../i18n';
import { AppShell } from '../layouts/AppShell';

export function AdminUploadPage({ route }: { route: Route }) {
  const { t } = useI18n();
  return (
    <AppShell route={route}>
      <AdminChrome
        route={route}
        title={t('upload.title')}
        subtitle={t('upload.subtitle')}
        actions={
          <button
            type="button"
            className="nl-btn nl-btn-ghost"
            onClick={() => navigate({ name: 'admin' })}
          >
            {t('admin.backToLibrary')}
          </button>
        }
      >
        <section className="admin-upload-panel">
          <UploadPanel
            onCreated={(job) => {
              navigate({ name: 'job', id: job.id });
            }}
          />
        </section>
      </AdminChrome>
    </AppShell>
  );
}
