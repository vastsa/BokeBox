import { UploadPanel } from '../components/admin/UploadPanel';
import {
  IconBack,
  IconMic,
  IconSpark,
  IconText,
  IconVideo,
  IconWave,
} from '../components/icons';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

const PIPELINE = [
  { icon: IconVideo, label: '上传视频' },
  { icon: IconWave, label: '提取音频' },
  { icon: IconText, label: '语音转写' },
  { icon: IconSpark, label: '脚本生成' },
  { icon: IconMic, label: 'TTS 合成' },
] as const;

export function AdminUploadPage({ route }: { route: Route }) {
  return (
    <AppShell route={route}>
      <div className="admin-container nl-enter space-y-3 sm:space-y-4">
        <section className="page-head pb-0">
          <button
            type="button"
            className="upload-back-btn"
            onClick={() => navigate({ name: 'admin' })}
          >
            <IconBack size={16} />
            返回任务管理
          </button>

          <div className="upload-hero">
            <div className="upload-hero-copy">
              <div className="page-kicker">Upload Studio</div>
              <h1 className="page-title mt-1">上传内容，一键成播客</h1>
              <p className="page-subtitle">
                先配置口播人设、音色与发布策略，再上传本地文件或粘贴 URL（视频/音频/文本自动识别并分流）。系统会完成转写、脚本重构与口播合成。
              </p>
            </div>

            <div className="upload-pipeline" aria-label="处理流水线">
              {PIPELINE.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="upload-pipeline-step">
                    <div className="upload-pipeline-icon">
                      <Icon size={15} />
                    </div>
                    <div className="upload-pipeline-meta">
                      <span className="step-index">0{index + 1}</span>
                      <span className="step-label">{step.label}</span>
                    </div>
                    {index < PIPELINE.length - 1 && (
                      <span className="upload-pipeline-connector" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="admin-upload-wrap">
          <UploadPanel
            onCreated={(job) => {
              navigate({ name: 'admin-job', id: job.id });
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
