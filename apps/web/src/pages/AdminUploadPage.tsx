import { UploadPanel } from '../components/admin/UploadPanel';
import { IconBack } from '../components/icons';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

export function AdminUploadPage({ route }: { route: Route }) {
  return (
    <AppShell route={route}>
      <div className="admin-container nl-enter space-y-3 sm:space-y-3.5">
        <section className="page-head upload-page-head">
          <button
            type="button"
            className="upload-back-btn"
            onClick={() => navigate({ name: 'home' })}
          >
            <IconBack size={16} />
            返回
          </button>

          <div className="upload-hero-copy">
            <h1 className="page-title">制作播客</h1>
            <p className="page-subtitle">
              上传文件或粘贴链接，自动完成转写、脚本与口播合成。
            </p>
          </div>
        </section>

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
