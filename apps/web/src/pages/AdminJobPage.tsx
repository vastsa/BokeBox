import { useCallback, useEffect, useState } from 'react';
import {
  fetchJob,
  updateJob,
} from '../api/client';
import {
  IconRefresh,
} from '../components/icons';
import {
  formatTime,
} from '../lib/format';
import { navigate, type Route } from '../lib/router';
import { applyRouteSeo, contentSeoFromJob } from '../lib/pageSeo';
import type { Job, PipelineFromStep } from '../types/job';
import {
  ACTIVE_STATUSES,
  RERUN_STEPS,
  canSelectFromStep,
  pickDefaultFromStep,
  pipelineIndex,
} from '../features/admin-job/pipelineSteps';
import { JobDetailHero } from '../features/admin-job/JobDetailHero';
import { JobReprocessPanel } from '../features/admin-job/JobReprocessPanel';
import { JobContentPanel, type ContentTab } from '../features/admin-job/JobContentPanel';
import {
  JobOverviewPanel,
  type OverviewTab,
} from '../features/admin-job/JobOverviewPanel';
import { AppShell } from '../layouts/AppShell';
import { AdminChrome } from '../components/admin/AdminChrome';
import {
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../i18n';

export function AdminJobPage({ id, route }: { id: string; route: Route }) {
  const { t } = useI18n();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'publish' | 'retry' | 'delete' | 'flashcards' | null>(null);
  const [fromStep, setFromStep] = useState<PipelineFromStep>('extract');
  const [jobContentLocale, setJobContentLocale] = useState<Locale>('zh-CN');
  const [tab, setTab] = useState<ContentTab>('script');
  const [overviewTab, setOverviewTab] = useState<OverviewTab>('result');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [followScript, setFollowScript] = useState(false);
  const [playState, setPlayState] = useState({
    current: 0,
    duration: 0,
    playing: false,
  });
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const j = await fetchJob(id);
      setJob(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!job || job.id !== id) {
      applyRouteSeo({ name: 'job', id });
      return;
    }
    applyRouteSeo({ name: 'job', id }, contentSeoFromJob(job));
  }, [id, job]);

  useEffect(() => {
    if (!job) return;
    if (!ACTIVE_STATUSES.includes(job.status)) return;
    const t = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(t);
  }, [job, refresh]);

  useEffect(() => {
    if (!job) return;
    if (job.podcast?.script) setTab('script');
    else if (job.transcript) setTab('transcript');
    else setTab('source');
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSeekRequest(null);
    setPlayState({ current: 0, duration: 0, playing: false });
    setFollowScript(false);
    setConfirmDelete(false);
    setFromStep('extract');
    setOverviewTab('result');
  }, [id]);

  // 任务就绪后，默认选最省时的可行起点
  // 任务切换或处理完成：推荐最省时的起点
  useEffect(() => {
    if (!job) return;
    if (ACTIVE_STATUSES.includes(job.status)) return;
    setFromStep(pickDefaultFromStep(job));
  }, [job?.id, job?.status]);

  // 同步任务内容语言选择
  useEffect(() => {
    if (!job) return;
    setJobContentLocale(resolveContentLocale(job.locale));
  }, [job?.id, job?.locale]);

  // 资产变化导致当前起点不可用时，自动回落
  useEffect(() => {
    if (!job) return;
    setFromStep((prev) =>
      canSelectFromStep(job, prev) ? prev : pickDefaultFromStep(job),
    );
  }, [
    job?.hasSourceAudio,
    job?.hasTranscript,
    job?.podcast?.script,
    job?.podcast?.flashcards?.length,
    job?.sourceKind,
  ]);

  if (error) {
    return (
      <AppShell route={route}>
        <AdminChrome
          route={route}
          title={t('admin.jobDetailTitle')}
          subtitle={t('admin.jobDetailSub')}
        >
          <div className="jd-empty py-16 text-center">
            <p className="text-[var(--danger)]">{error}</p>
            <button
              type="button"
              className="nl-btn nl-btn-primary mt-4"
              onClick={() => navigate({ name: 'admin' })}
            >
              {t('admin.backToLibrary')}
            </button>
          </div>
        </AdminChrome>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell route={route}>
        <AdminChrome
          route={route}
          title={t('admin.jobDetailTitle')}
          subtitle={t('admin.jobDetailSub')}
        >
          <div className="jd-page space-y-3">
            <div className="nl-shimmer h-28" />
            <div className="nl-shimmer h-48" />
            <div className="jd-layout">
              <div className="nl-shimmer h-80" />
              <div className="nl-shimmer h-56" />
            </div>
          </div>
        </AdminChrome>
      </AppShell>
    );
  }

  const title = job.podcast?.title || job.title;
  const active = ACTIVE_STATUSES.includes(job.status);
  const stepIdx = pipelineIndex(job.status);
  const canListen = job.status === 'done' && Boolean(job.hasPodcastAudio);
  const canRerun =
    (job.status === 'done' || job.status === 'failed') && !active && !busy;
  const selectedStepOk = canSelectFromStep(job, fromStep);
  const showPipeline = active || job.status === 'failed';
  const selectedMeta = RERUN_STEPS.find((s) => s.key === fromStep);

  const runAction = async (
    kind: 'publish' | 'retry' | 'delete' | 'flashcards',
    fn: () => Promise<unknown>,
  ) => {
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
      if (kind === 'delete') {
        navigate({ name: 'admin' });
        return;
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  return (
    <AppShell route={route}>
      <AdminChrome
        route={route}
        title={t('admin.jobDetailTitle')}
        subtitle={t('admin.jobDetailSub')}
      >
      <div className="jd-page">
        {/* 上：任务头图 / 状态 */}
        <JobDetailHero
          job={job}
          title={title}
          canListen={canListen}
          busy={busy}
          active={active}
          showPipeline={showPipeline}
          stepIdx={stepIdx}
          actionError={actionError}
          onRefresh={() => void refresh()}
          runAction={runAction}
        />

        {/* 中：节目效果 / 资产状态 / 生成配置（横排 Tab） */}
        <JobOverviewPanel
          job={job}
          tab={overviewTab}
          active={active}
          seekRequest={seekRequest}
          onTabChange={setOverviewTab}
          onStateChange={setPlayState}
        />

        {/* 下：内容详情 + 任务信息 / 重处理 */}
        <div className="jd-layout">
          <div className="jd-main">
            <JobContentPanel
              job={job}
              tab={tab}
              followScript={followScript}
              playState={playState}
              active={active}
              busy={busy}
              onTabChange={setTab}
              onFollowScriptChange={setFollowScript}
              onSeek={setSeekRequest}
              runAction={runAction}
            />
          </div>

          <aside className="jd-side">
            <section className="jd-panel jd-meta-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">{t('job.infoTitle')}</h2>
              </div>
              <div className="jd-meta-grid">
                <div>
                  <span>{t('job.created')}</span>
                  <b>{formatTime(job.createdAt)}</b>
                </div>
                <div>
                  <span>{t('job.updated')}</span>
                  <b>{formatTime(job.updatedAt)}</b>
                </div>
                <div>
                  <span>{t('job.type')}</span>
                  <b>{job.mimeType || '—'}</b>
                </div>
                <div>
                  <span>{t('job.estimate')}</span>
                  <b>
                    {job.podcast?.estimatedMinutes
                      ? t('common.minutes', { n: job.podcast.estimatedMinutes })
                      : '—'}
                  </b>
                </div>
              </div>
            </section>

            <JobReprocessPanel
              job={job}
              fromStep={fromStep}
              jobContentLocale={jobContentLocale}
              active={active}
              busy={busy}
              canRerun={canRerun}
              selectedStepOk={selectedStepOk}
              selectedMeta={selectedMeta}
              confirmDelete={confirmDelete}
              onFromStepChange={setFromStep}
              onContentLocaleChange={setJobContentLocale}
              onConfirmDeleteChange={setConfirmDelete}
              runAction={runAction}
            />
          </aside>
        </div>

        <div className="jd-mobile-bar" role="toolbar" aria-label={t('admin.jobDetailTitle')}>
          <button
            type="button"
            className={[
              'nl-btn',
              job.published ? 'nl-btn-secondary' : 'nl-btn-primary',
            ].join(' ')}
            disabled={busy === 'publish'}
            onClick={() =>
              void runAction('publish', () =>
                updateJob(job.id, { published: !job.published }),
              )
            }
          >
            {busy === 'publish'
              ? t('job.updating')
              : job.published
                ? t('admin.unpublishAction')
                : t('admin.publishAction')}
          </button>
          {canListen ? (
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => navigate({ name: 'player', id: job.id })}
            >
              {t('job.openPlayer')}
            </button>
          ) : canRerun ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => {
                document
                  .getElementById('jd-reprocess-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {t('job.reprocess')}
            </button>
          ) : (
            <button
              type="button"
              className="nl-btn nl-btn-ghost"
              onClick={() => void refresh()}
            >
              <IconRefresh size={15} />
              {t('common.refresh')}
            </button>
          )}
        </div>
      </div>
      </AdminChrome>
    </AppShell>
  );
}

