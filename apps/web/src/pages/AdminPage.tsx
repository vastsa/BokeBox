import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJob,
  fetchJobs,
  retryJob,
  updateJob,
} from '../api/client';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  IconDashboard,
  IconMic,
  IconRefresh,
  IconSpark,
  IconTrash,
  IconUpload,
} from '../components/icons';
import { EmptyState } from '../components/ui/EmptyState';
import { CoverArt } from '../components/ui/CoverArt';
import { formatSize, formatTime } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus } from '../types/job';
import { AppShell } from '../layouts/AppShell';

const MODE_LABEL: Record<string, string> = {
  default: '自然口播',
  voicedesign: '自定义',
};

const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'synthesizing_audio',
];

export function AdminPage({ route }: { route: Route }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchJobs();
      setJobs(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const active = jobs.some((j) => ACTIVE.includes(j.status));
    if (!active) return;
    const t = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(t);
  }, [jobs, refresh]);

  const stats = useMemo(() => {
    const activeCount = jobs.filter((j) => ACTIVE.includes(j.status)).length;
    const publishedCount = jobs.filter((j) => j.published).length;
    const failedCount = jobs.filter((j) => j.status === 'failed').length;
    return { activeCount, publishedCount, failedCount };
  }, [jobs]);

  const runJobAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell route={route}>
      <div className="admin-container nl-enter studio-page">
        {/* 顶栏 */}
        <header className="studio-head">
          <div className="studio-head-copy">
            <div className="page-kicker">Studio Console</div>
            <h1 className="page-title">任务管理</h1>
            <p className="page-subtitle">
              管理视频转播客资产，生成播客资产。
            </p>
          </div>
          <div className="studio-head-actions">
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => navigate({ name: 'create' })}
            >
              <IconUpload size={15} />
              上传
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'home' })}
            >
              首页
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-ghost studio-icon-btn"
              onClick={() => void refresh()}
              aria-label="刷新"
              title="刷新"
            >
              <IconRefresh size={15} />
            </button>
          </div>
        </header>

        {/* 紧凑指标条 */}
        <section className="studio-metrics" aria-label="任务统计">
          <MetricPill
            label="全部"
            value={jobs.length}
            tone="default"
          />
          <MetricPill
            label="处理中"
            value={stats.activeCount}
            tone={stats.activeCount > 0 ? 'brand' : 'default'}
            pulse={stats.activeCount > 0}
          />
          <MetricPill
            label="已发布"
            value={stats.publishedCount}
            tone={stats.publishedCount > 0 ? 'success' : 'default'}
          />
          {stats.failedCount > 0 && (
            <MetricPill
              label="失败"
              value={stats.failedCount}
              tone="danger"
            />
          )}

        </section>

        {error && (
          <div className="studio-alert" role="alert">
            {error}
          </div>
        )}

        {/* 任务库 */}
        <section className="studio-library">
          <div className="studio-library-head">
            <div>
              <h2>任务资产库</h2>
              <p>
                {loading
                  ? '加载中…'
                  : jobs.length
                    ? `${jobs.length} 条任务`
                    : '暂无任务'}
              </p>
            </div>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'create' })}
            >
              <IconUpload size={14} />
              新建
            </button>
          </div>

          {loading ? (
            <div className="studio-skel">
              <div className="nl-shimmer h-20" />
              <div className="nl-shimmer h-20" />
              <div className="nl-shimmer h-20" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="studio-empty-wrap">
              <EmptyState
                icon={<IconDashboard size={22} />}
                title="还没有任务"
                description="上传一段视频，自动生成可发布的播客。"
                actionLabel="上传视频"
                onAction={() => navigate({ name: 'create' })}
              />
            </div>
          ) : (
            <div className="studio-job-list">
              {jobs.map((job, i) => (
                <JobRow
                  key={job.id}
                  job={job}
                  index={i}
                  busy={busyId === job.id}
                  onOpen={() => navigate({ name: 'job', id: job.id })}
                  onTogglePublish={() =>
                    void runJobAction(job.id, () =>
                      updateJob(job.id, { published: !job.published }),
                    )
                  }
                  onRetry={() =>
                    void runJobAction(job.id, () => retryJob(job.id))
                  }
                  onDelete={() => {
                    if (!confirm('确认删除该任务及全部本地资产？')) return;
                    void runJobAction(job.id, () => deleteJob(job.id));
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function MetricPill({
  label,
  value,
  tone = 'default',
  pulse = false,
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'brand' | 'success' | 'danger';
  pulse?: boolean;
}) {
  return (
    <div className={['studio-metric', `is-${tone}`, pulse ? 'is-pulse' : ''].filter(Boolean).join(' ')}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function JobRow({
  job,
  index,
  busy,
  onOpen,
  onTogglePublish,
  onRetry,
  onDelete,
}: {
  job: Job;
  index: number;
  busy: boolean;
  onOpen: () => void;
  onTogglePublish: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const title = job.podcast?.title || job.title;
  const mode = job.tts?.mode || 'default';
  const active = ACTIVE.includes(job.status);
  const showProgress = active || job.status === 'failed';
  const canRetry = job.status === 'failed' || job.status === 'done';

  const assets = [
    { key: 'v', label: '视频', ok: Boolean(job.hasVideo) },
    { key: 'a', label: '音频', ok: Boolean(job.hasSourceAudio) },
    { key: 't', label: '转写', ok: Boolean(job.hasTranscript) },
    { key: 'p', label: '播客', ok: Boolean(job.hasPodcastAudio) },
  ];
  const readyCount = assets.filter((a) => a.ok).length;

  return (
    <article
      className={[
        'studio-job',
        active ? 'is-active' : '',
        job.status === 'failed' ? 'is-failed' : '',
        job.status === 'done' ? 'is-done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--stagger' as string]: `${Math.min(index, 8) * 40}ms` }}
    >
      <button type="button" className="studio-job-main" onClick={onOpen}>
        <span className="studio-job-cover-wrap" aria-hidden>
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
            title={title}
            className="studio-job-cover"
          >
            <IconMic size={16} />
          </CoverArt>
          {job.published && <i className="studio-job-live" title="已发布" />}
        </span>

        <div className="studio-job-body">
          <div className="studio-job-top">
            <h3 className="studio-job-title">{title}</h3>
            <div className="studio-job-badges">
              <StatusBadge status={job.status} />
              {job.published ? (
                <span className="nl-tag nl-tag-success">已发布</span>
              ) : (
                <span className="nl-tag">未发布</span>
              )}
            </div>
          </div>

          <div className="studio-job-sub">
            <span className="truncate">{job.originalFilename}</span>
            <span className="dot">·</span>
            <span>{formatSize(job.size)}</span>
            <span className="dot">·</span>
            <span>{formatTime(job.createdAt)}</span>
          </div>

          <div className="studio-job-meta">
            <div className="studio-job-assets" title={`资产 ${readyCount}/4`}>
              {assets.map((a) => (
                <span
                  key={a.key}
                  className={['studio-asset', a.ok ? 'is-ok' : ''].join(' ')}
                >
                  {a.label}
                </span>
              ))}
            </div>
            <span className="studio-job-tts">
              <IconSpark size={11} />
              {MODE_LABEL[mode] || mode}
              {job.tts?.voice ? ` · ${job.tts.voice}` : ''}
            </span>
          </div>

          {showProgress && (
            <div className="studio-job-progress">
              <div className="studio-job-progress-row">
                <span className="truncate">
                  {job.message}
                  {job.error ? ` · ${job.error}` : ''}
                </span>
                <span>{Math.round(job.progress)}%</span>
              </div>
              <ProgressBar
                value={job.progress}
                tone={job.status === 'failed' ? 'danger' : 'brand'}
              />
            </div>
          )}

          {!showProgress && job.message && (
            <p className="studio-job-msg">{job.message}</p>
          )}
        </div>
      </button>

      <div className="studio-job-actions">
        <button
          type="button"
          className="nl-btn nl-btn-primary"
          onClick={onOpen}
        >
          详情
        </button>
        <button
          type="button"
          className="nl-btn nl-btn-secondary"
          disabled={busy}
          onClick={onTogglePublish}
        >
          {job.published ? '取消发布' : '发布'}
        </button>
        {canRetry && (
          <button
            type="button"
            className="nl-btn nl-btn-ghost studio-icon-btn"
            disabled={busy}
            onClick={onRetry}
            aria-label="重跑"
            title="智能重跑（跳过已完成步骤）"
          >
            <IconRefresh size={14} />
          </button>
        )}
        <button
          type="button"
          className="nl-btn nl-btn-ghost studio-icon-btn is-danger"
          disabled={busy}
          onClick={onDelete}
          aria-label="删除"
          title="删除"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </article>
  );
}

