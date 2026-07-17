import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJob,
  fetchJobs,
  retryJob,
  updateJob,
  coverImageUrl,
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
import { formatSize, formatSourceLabel, formatTime } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { useI18n } from '../i18n';

// labels resolved via t() at render

const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

export function AdminPage({ route }: { route: Route }) {
  const { t } = useI18n();
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
            <h1 className="page-title">{t('admin.title')}</h1>
            <p className="page-subtitle">
              {t('admin.subtitle')}
            </p>
          </div>
          <div className="studio-head-actions">
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => navigate({ name: 'create' })}
            >
              <IconUpload size={15} />
              {t('admin.upload')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'home' })}
            >
              {t('nav.home')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-ghost studio-icon-btn"
              onClick={() => void refresh()}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <IconRefresh size={15} />
            </button>
          </div>
        </header>

        {/* 紧凑指标条 */}
        <section className="studio-metrics" aria-label={t('admin.metricsAria')}>
          <MetricPill
            label={t('admin.all')}
            value={jobs.length}
            tone="default"
          />
          <MetricPill
            label={t('admin.processing')}
            value={stats.activeCount}
            tone={stats.activeCount > 0 ? 'brand' : 'default'}
            pulse={stats.activeCount > 0}
          />
          <MetricPill
            label={t('admin.published')}
            value={stats.publishedCount}
            tone={stats.publishedCount > 0 ? 'success' : 'default'}
          />
          {stats.failedCount > 0 && (
            <MetricPill
              label={t('admin.failed')}
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
              <h2>{t('admin.library')}</h2>
              <p>
                {loading
                  ? t('common.loading')
                  : jobs.length
                    ? t('admin.jobCount', { n: jobs.length })
                     : t('admin.noJobs')}
              </p>
            </div>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'create' })}
            >
              <IconUpload size={14} />
              {t('admin.newJob')}
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
                title={t('admin.emptyTitle')}
                description={t('admin.emptyDesc')}
                actionLabel={t('admin.emptyAction')}
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
                    if (!confirm(t('admin.confirmDelete'))) return;
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
  const { t } = useI18n();
  const title = job.podcast?.title || job.title;
  const mode = job.tts?.mode || 'default';
  const active = ACTIVE.includes(job.status);
  const showProgress = active || job.status === 'failed';
  const canRetry = job.status === 'failed' || job.status === 'done';

  const assets = [
    { key: 'v', label: t('admin.assetVideo'), ok: Boolean(job.hasVideo) },
    { key: 'a', label: t('admin.assetAudio'), ok: Boolean(job.hasSourceAudio) },
    { key: 't', label: t('admin.assetTranscript'), ok: Boolean(job.hasTranscript) },
    { key: 'p', label: t('admin.assetPodcast'), ok: Boolean(job.hasPodcastAudio) },
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
            imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt) : undefined}
            title={title}
            className="studio-job-cover"
          >
            <IconMic size={16} />
          </CoverArt>
          {job.published && <i className="studio-job-live" title={t('admin.published')} />}
        </span>

        <div className="studio-job-body">
          <div className="studio-job-top">
            <h3 className="studio-job-title">{title}</h3>
            <div className="studio-job-badges">
              <StatusBadge status={job.status} />
              {job.published ? (
                <span className="nl-tag nl-tag-success">{t('admin.published')}</span>
              ) : (
                <span className="nl-tag">{t('admin.unpublished')}</span>
              )}
            </div>
          </div>

          <div className="studio-job-sub">
            <span
              className="studio-source-label truncate"
              title={job.sourceUrl || job.originalFilename}
            >
              {formatSourceLabel(job.sourceUrl || job.originalFilename)}
            </span>
            <span className="dot">·</span>
            <span>{formatSize(job.size)}</span>
            <span className="dot">·</span>
            <span>{formatTime(job.createdAt)}</span>
          </div>

          <div className="studio-job-meta">
            <div className="studio-job-assets" title={t('admin.assetsTitle', { ready: readyCount })}>
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
              {mode === 'voicedesign' ? t('admin.ttsCustom') : t('admin.ttsDefault')}
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
          {t('common.details')}
        </button>
        <button
          type="button"
          className="nl-btn nl-btn-secondary"
          disabled={busy}
          onClick={onTogglePublish}
        >
          {job.published ? t('admin.unpublish') : t('admin.publish')}
        </button>
        {canRetry && (
          <button
            type="button"
            className="nl-btn nl-btn-ghost studio-icon-btn"
            disabled={busy}
            onClick={onRetry}
            aria-label={t('admin.rerun')}
            title={t('admin.rerunTitle')}
          >
            <IconRefresh size={14} />
          </button>
        )}
        <button
          type="button"
          className="nl-btn nl-btn-ghost studio-icon-btn is-danger"
          disabled={busy}
          onClick={onDelete}
          aria-label={t('common.delete')}
          title={t('common.delete')}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </article>
  );
}

