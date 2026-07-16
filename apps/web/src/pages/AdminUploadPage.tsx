import { UploadPanel } from '../components/admin/UploadPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

export function AdminUploadPage({ route }: { route: Route }) {
  return (
    <AppShell route={route}>
      <div className="page-container app-page nl-enter">
        <PageHeader
          title="制作播客"
          subtitle="上传文件或粘贴链接，自动完成转写、脚本与口播合成"
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
