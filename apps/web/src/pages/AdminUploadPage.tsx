import { UploadPanel } from '../components/admin/UploadPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { navigate, type Route } from '../lib/router';
import { useI18n } from '../i18n';
import { AppShell } from '../layouts/AppShell';

export function AdminUploadPage({ route }: { route: Route }) {
  const { t } = useI18n();
  return (
    <AppShell route={route}>
      <div className="page-container app-page nl-enter">
        <PageHeader
          title={t('upload.title')}
          subtitle={t('upload.subtitle')}
        />

        <section className="admin-upload-wrap">
          <UploadPanel
            onCreated={(job) => {
              navigate({ name: 'job', id: job.id });
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
