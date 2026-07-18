import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  coverImageUrl,
  deleteJob,
  fetchJobs,
  retryJob,
  updateJob,
} from '../api/client';
import { Pagination } from '../components/ui/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { JobListFacets, JobListFilter } from '../types/pagination';
import { AdminChrome } from '../components/admin/AdminChrome';
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
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import { formatSize, formatSourceLabel, formatTime } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { useI18n } from '../i18n';

const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

type FilterKey = JobListFilter;

const EMPTY_FACETS: JobListFacets = {
  all: 0,
  active: 0,
  published: 0,
  draft: 0,
  failed: 0,
  done: 0,
};

const PAGE_SIZE = 20;

export function AdminPage({ route }: { route: Route }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<JobListFacets>(EMPTY_FACETS);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchJobs({
        page,
        pageSize: PAGE_SIZE,
        q: debouncedQuery,
        filter,
      });
      setJobs(res.jobs);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setFacets(res.facets || EMPTY_FACETS);
      // 页码越界时回退
      if (res.page !== page && res.page >= 1) {
        setPage(res.page);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, filter]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // 筛选 / 搜索变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQuery]);

  useEffect(() => {
    const active = facets.active > 0 || jobs.some((j) => ACTIVE.includes(j.status));
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [facets.active, jobs, refresh]);

  const stats = useMemo(
    () => ({
      total: facets.all,
      activeCount: facets.active,
      publishedCount: facets.published,
      draftCount: facets.draft,
      failedCount: facets.failed,
      doneCount: facets.done,
    }),
    [facets],
  );

  const filtered = jobs;

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

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: t('admin.all'), count: stats.total },
    { key: 'active', label: t('admin.processing'), count: stats.activeCount },
    { key: 'done', label: t('admin.done'), count: stats.doneCount },
    { key: 'published', label: t('admin.published'), count: stats.publishedCount },
    { key: 'draft', label: t('admin.draft'), count: stats.draftCount },
    { key: 'failed', label: t('admin.failed'), count: stats.failedCount },
  ];

  return (
    <AppShell route={route}>
      <AdminChrome
        route={route}
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={
          <>
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
              className="nl-btn nl-btn-ghost studio-icon-btn"
              onClick={() => void refresh()}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <IconRefresh size={15} />
            </button>
          </>
        }
      >
        <section className="admin-stats" aria-label={t('admin.metricsAria')}>
          <StatCard
            label={t('admin.all')}
            value={stats.total}
            tone="default"
          />
          <StatCard
            label={t('admin.processing')}
            value={stats.activeCount}
            tone={stats.activeCount > 0 ? 'brand' : 'default'}
            pulse={stats.activeCount > 0}
          />
          <StatCard
            label={t('admin.published')}
            value={stats.publishedCount}
            tone={stats.publishedCount > 0 ? 'success' : 'default'}
          />
          <StatCard
            label={t('admin.failed')}
            value={stats.failedCount}
            tone={stats.failedCount > 0 ? 'danger' : 'default'}
          />
        </section>

        <section className="admin-toolbar">
          <div className="admin-filters" role="tablist" aria-label={t('admin.filtersAria')}>
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                className={[
                  'admin-filter',
                  filter === item.key ? 'is-active' : '',
                  item.key === 'failed' && item.count > 0 ? 'is-danger' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter(item.key)}
              >
                <span>{item.label}</span>
                <em>{item.count}</em>
              </button>
            ))}
          </div>
          <label className="admin-search">
            <span className="sr-only">{t('admin.search')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.searchPlaceholder')}
            />
          </label>
        </section>

        {error && (
          <div className="studio-alert" role="alert">
            {error}
          </div>
        )}

        <section className="admin-library">
          <div className="admin-library-head">
            <div>
              <h2>{t('admin.library')}</h2>
              <p>
                {loading
                  ? t('common.loading')
                  : total
                    ? t('admin.jobCount', { n: total })
                    : t('admin.noJobs')}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="admin-skel">
              <div className="nl-shimmer h-24" />
              <div className="nl-shimmer h-24" />
              <div className="nl-shimmer h-24" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty-wrap">
              <EmptyState
                icon={<IconDashboard size={22} />}
                title={
                  total === 0 && filter === 'all' && !debouncedQuery
                    ? t('admin.emptyTitle')
                    : t('admin.emptyFilterTitle')
                }
                description={
                  total === 0 && filter === 'all' && !debouncedQuery
                    ? t('admin.emptyDesc')
                    : t('admin.emptyFilterDesc')
                }
                actionLabel={
                  total === 0 && filter === 'all' && !debouncedQuery
                    ? t('admin.emptyAction')
                    : t('admin.clearFilter')
                }
                onAction={() => {
                  if (total === 0 && filter === 'all' && !debouncedQuery) {
                    navigate({ name: 'create' });
                  } else {
                    setFilter('all');
                    setQuery('');
                    setPage(1);
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div className="admin-job-list">
                {filtered.map((job, i) => (
                  <JobCard
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
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                disabled={loading}
                onChange={setPage}
              />
            </>
          )}
        </section>
      </AdminChrome>
    </AppShell>
  );
}

function StatCard({
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
    <div
      className={[
        'admin-stat',
        `is-${tone}`,
        pulse ? 'is-pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function JobCard({
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
        'admin-job-card',
        active ? 'is-active' : '',
        job.status === 'failed' ? 'is-failed' : '',
        job.status === 'done' ? 'is-done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--stagger' as string]: `${Math.min(index, 8) * 35}ms` }}
    >
      <button type="button" className="admin-job-main" onClick={onOpen}>
        <span className="admin-job-cover-wrap" aria-hidden>
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
            imageUrl={
              job.podcast?.hasCoverImage
                ? coverImageUrl(job.id, job.updatedAt)
                : undefined
            }
            title={title}
            className="admin-job-cover"
          >
            <IconMic size={16} />
          </CoverArt>
          {job.published && (
            <i className="admin-job-live" title={t('admin.published')} />
          )}
        </span>

        <div className="admin-job-body">
          <div className="admin-job-top">
            <h3 className="admin-job-title">{title}</h3>
            <div className="admin-job-badges">
              <StatusBadge status={job.status} />
              {job.published ? (
                <span className="nl-tag nl-tag-success">{t('admin.published')}</span>
              ) : (
                <span className="nl-tag">{t('admin.draft')}</span>
              )}
            </div>
          </div>

          <div className="admin-job-sub">
            <span
              className="admin-source-label"
              title={job.sourceUrl || job.originalFilename}
            >
              {formatSourceLabel(job.sourceUrl || job.originalFilename)}
            </span>
            <span className="dot">·</span>
            <span>{formatSize(job.size)}</span>
            <span className="dot">·</span>
            <span>{formatTime(job.createdAt)}</span>
          </div>

          <div className="admin-job-meta">
            <div
              className="admin-job-assets"
              title={t('admin.assetsTitle', { ready: readyCount })}
            >
              {assets.map((a) => (
                <span
                  key={a.key}
                  className={['admin-asset', a.ok ? 'is-ok' : ''].join(' ')}
                >
                  {a.label}
                </span>
              ))}
            </div>
            <span className="admin-job-tts">
              <IconSpark size={11} />
              {mode === 'voicedesign' ? t('admin.ttsCustom') : t('admin.ttsDefault')}
              {job.tts?.voice ? ` · ${job.tts.voice}` : ''}
            </span>
          </div>

          {showProgress && (
            <div className="admin-job-progress">
              <div className="admin-job-progress-row">
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
            <p className="admin-job-msg">{job.message}</p>
          )}
        </div>
      </button>

      <div className="admin-job-actions">
        <button type="button" className="nl-btn nl-btn-primary" onClick={onOpen}>
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
