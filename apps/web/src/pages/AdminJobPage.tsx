import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchJob,
  podcastAudioUrl,
  updateJob,
  coverImageUrl,
} from '../api/client';
import { ScriptPromptSummary } from '../components/admin/ScriptPromptSummary';
import { TtsSummary } from '../components/admin/TtsSummary';
import { MiniPlayer } from '../components/listen/MiniPlayer';
import {
  IconDownload,
  IconRefresh,
  IconWave,
} from '../components/icons';
import {
  coverGradientFor,
  formatTime,
} from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { Job, PipelineFromStep } from '../types/job';
import {
  ACTIVE_STATUSES,
  RERUN_STEPS,
  canSelectFromStep,
  pickDefaultFromStep,
  pipelineIndex,
} from '../features/admin-job/pipelineSteps';
import { JobDetailHero } from '../features/admin-job/JobDetailHero';
import { JobAssetsPanel } from '../features/admin-job/JobAssetsPanel';
import { JobReprocessPanel } from '../features/admin-job/JobReprocessPanel';
import { JobContentPanel, type ContentTab } from '../features/admin-job/JobContentPanel';
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

  const cover = useMemo(
    () => (job ? coverGradientFor(job.id, job.podcast?.coverGradient) : ''),
    [job],
  );

  if (error) {
    return (
      <AppShell route={route}>
        <div className="admin-container py-16 text-center">
          <div className="jd-empty">
            <p className="text-[var(--danger)]">{error}</p>
            <button
              type="button"
              className="nl-btn nl-btn-primary mt-4"
              onClick={() => navigate({ name: 'admin' })}
            >
              {t('admin.backToLibrary')}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell route={route}>
        <div className="admin-container space-y-3 py-8">
          <div className="nl-shimmer h-10 w-36" />
          <div className="nl-shimmer h-28" />
          <div className="jd-layout">
            <div className="nl-shimmer h-80" />
            <div className="nl-shimmer h-80" />
          </div>
        </div>
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
      <div className="admin-container nl-enter jd-page">
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

        <div className="jd-layout">
          <div className="jd-main">
            <section className="jd-panel jd-panel-result">
              <div className="jd-panel-head">
                <div className="jd-panel-head-copy">
                  <h2>{t('job.resultTitle')}</h2>
                  {job.podcast?.estimatedMinutes ? (
                    <p className="jd-panel-sub">
                      {t('common.minutes', { n: job.podcast.estimatedMinutes })}
                    </p>
                  ) : null}
                </div>
                <div className="jd-panel-actions">
                  {job.hasPodcastAudio && (
                    <a
                      href={podcastAudioUrl(job.id, true)}
                      className="nl-btn nl-btn-secondary"
                    >
                      <IconDownload size={14} />
                      {t('common.download')}
                    </a>
                  )}
                  {canListen && (
                    <button
                      type="button"
                      className="nl-btn nl-btn-ghost"
                      onClick={() => navigate({ name: 'player', id: job.id })}
                    >
                      {t('job.immersive')}
                    </button>
                  )}
                </div>
              </div>

              <div className="jd-result-body">
                {job.hasPodcastAudio ? (
                  <MiniPlayer
                    key={job.updatedAt}
                    trackId={job.id}
                    src={podcastAudioUrl(job.id, false, String(job.updatedAt))}
                    title={title}
                    downloadUrl={podcastAudioUrl(job.id, true)}
                    coverClassName={cover}
                    coverImageUrl={
                      job.podcast?.hasCoverImage
                        ? coverImageUrl(job.id, job.updatedAt, 'md')
                        : undefined
                    }
                    summary={job.podcast?.summary}
                    seekRequest={seekRequest}
                    onStateChange={setPlayState}
                  />
                ) : (
                  <div className="jd-placeholder">
                    <IconWave size={18} />
                    <span>
                      {active ? t('job.audioGenerating') : t('job.audioMissing')}
                    </span>
                  </div>
                )}

                {(job.podcast?.summary ||
                  !!job.podcast?.tags?.length ||
                  !!job.podcast?.outline?.length) && (
                  <div className="jd-result-meta">
                    {job.podcast?.summary && (
                      <p className="jd-summary">{job.podcast.summary}</p>
                    )}

                    {!!job.podcast?.tags?.length && (
                      <div className="jd-tags">
                        {job.podcast.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}

                    {!!job.podcast?.outline?.length && (
                      <div className="jd-outline">
                        <div className="jd-outline-h">{t('job.outline')}</div>
                        <ol>
                          {job.podcast.outline.map((seg, i) => (
                            <li key={`${seg.title}-${i}`}>
                              <em>{String(i + 1).padStart(2, '0')}</em>
                              <div>
                                <strong>{seg.title}</strong>
                                {seg.summary && <p>{seg.summary}</p>}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

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
            <JobAssetsPanel job={job} />

            <section className="jd-panel jd-panel-config">
              <div className="jd-side-head">
                <h2 className="jd-side-title">{t('job.configTitle')}</h2>
                <span className="nl-chip">{t('common.readonly')}</span>
              </div>

              <div className="jd-config-stack">
                <div className="jd-config-block">
                  <div className="jd-config-label">{t('job.ttsConfig')}</div>
                  <TtsSummary value={job.tts} />
                </div>
                <div className="jd-config-block">
                  <div className="jd-config-label">{t('job.persona')}</div>
                  <ScriptPromptSummary value={job.scriptPrompt} />
                </div>
              </div>
            </section>

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

