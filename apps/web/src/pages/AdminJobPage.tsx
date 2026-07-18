import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  fetchJob,
  generateFlashcards,
  podcastAudioUrl,
  sourceAudioUrl,
  updateJob,
  videoUrl,
  coverImageUrl,
} from '../api/client';
import { FlashcardsView } from '../components/FlashcardsView';
import { ScriptPromptSummary } from '../components/admin/ScriptPromptSummary';
import { TtsSummary } from '../components/admin/TtsSummary';
import { MiniPlayer } from '../components/listen/MiniPlayer';
import { ScriptFollow } from '../components/listen/ScriptFollow';
import {
  IconDownload,
  IconRefresh,
  IconSpark,
  IconVideo,
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
import { AppShell } from '../layouts/AppShell';
import { AdminChrome } from '../components/admin/AdminChrome';
import {
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../i18n';

type ContentTab = 'script' | 'notes' | 'flashcards' | 'transcript' | 'source';

const CONTENT_TABS: Array<{ key: ContentTab; labelKey: string }> = [
  { key: 'script', labelKey: 'job.tabScript' },
  { key: 'notes', labelKey: 'job.tabNotes' },
  { key: 'flashcards', labelKey: 'job.tabFlashcards' },
  { key: 'transcript', labelKey: 'job.tabTranscript' },
  { key: 'source', labelKey: 'job.tabSource' },
];

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
        {/* 状态总览：标题只在此出现一次，避免与页头重复 */}
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
            {/* 播放 + 摘要 */}
            <section className="jd-panel">
              <div className="jd-panel-head">
                <h2>{t('job.resultTitle')}</h2>
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

              {job.hasPodcastAudio ? (
                <MiniPlayer
                  key={job.updatedAt}
                  trackId={job.id}
                  src={podcastAudioUrl(job.id, false, String(job.updatedAt))}
                  title={title}
                  downloadUrl={podcastAudioUrl(job.id, true)}
                  coverClassName={cover}
                  coverImageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt, 'md') : undefined}
                  summary={job.podcast?.summary}
                  seekRequest={seekRequest}
                  onStateChange={setPlayState}
                />
              ) : (
                <div className="jd-placeholder">
                  <IconWave size={18} />
                  <span>{active ? t('job.audioGenerating') : t('job.audioMissing')}</span>
                </div>
              )}

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
            </section>

            {/* 内容区 */}
            <section className="jd-panel jd-content">
              <div className="jd-tabs" role="tablist">
                {CONTENT_TABS.map((item) => {
                  const ready =
                    item.key === 'script'
                      ? Boolean(job.podcast?.script)
                      : item.key === 'notes'
                        ? Boolean(job.podcast?.showNotes)
                        : item.key === 'flashcards'
                          ? Boolean(job.podcast?.flashcards?.length)
                          : item.key === 'transcript'
                            ? Boolean(job.transcript)
                            : Boolean(job.hasVideo || job.hasSourceAudio);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.key}
                      className={[
                        'jd-tab',
                        tab === item.key ? 'is-active' : '',
                        ready ? 'is-ready' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setTab(item.key);
                        if (item.key !== 'script') setFollowScript(false);
                      }}
                    >
                      {t(item.labelKey)}
                    </button>
                  );
                })}
                {job.podcast?.script && job.hasPodcastAudio && tab === 'script' && (
                  <button
                    type="button"
                    className={[
                      'jd-follow-btn',
                      followScript ? 'is-on' : '',
                    ].join(' ')}
                    onClick={() => setFollowScript((v) => !v)}
                  >
                    {followScript ? t('job.following') : t('job.followListen')}
                  </button>
                )}
              </div>

              <div className="jd-tab-body">
                {tab === 'script' &&
                  (job.podcast?.script ? (
                    followScript ? (
                      <ScriptFollow
                        script={job.podcast.script}
                        currentSec={playState.current}
                        durationSec={playState.duration}
                        onSeek={(sec) => setSeekRequest(sec)}
                        timing={job.podcast.scriptTiming}
                      />
                    ) : (
                      <pre className="jd-pre">{job.podcast.script}</pre>
                    )
                  ) : (
                    <div className="jd-placeholder soft">{t('job.scriptMissing')}</div>
                  ))}

                {tab === 'notes' && (
                  <article className="prose-soft max-w-none">
                    {job.podcast?.showNotes ? (
                      <ReactMarkdown>{job.podcast.showNotes}</ReactMarkdown>
                    ) : (
                      <div className="jd-placeholder soft">{t('job.notesMissing')}</div>
                    )}
                  </article>
                )}

                {tab === 'flashcards' && (
                  <div className="jd-flashcards">
                    <div className="jd-flashcards-bar">
                      <p className="jd-hint jd-hint-top">
                        {t('job.flashcardsHint')}
                      </p>
                      <button
                        type="button"
                        className="nl-btn nl-btn-secondary"
                        disabled={
                          Boolean(busy) ||
                          active ||
                          !(job.transcript || job.hasTranscript) ||
                          !job.podcast
                        }
                        onClick={() =>
                          void runAction('flashcards', () =>
                            generateFlashcards(job.id),
                          )
                        }
                      >
                        <IconSpark size={14} />
                        {busy === 'flashcards'
                          ? t('job.flashcardsGenerating')
                          : job.podcast?.flashcards?.length
                            ? t('job.flashcardsRegen')
                             : t('job.flashcardsGenerate')}
                      </button>
                    </div>
                    <FlashcardsView
                      cards={job.podcast?.flashcards}
                      emptyText={t('job.flashcardsEmpty')}
                    />
                  </div>
                )}

                {tab === 'transcript' && (
                  <pre className="jd-pre">
                    {job.transcript || t('job.transcriptMissing')}
                  </pre>
                )}

                {tab === 'source' && (
                  <div className="jd-source">
                    <div className="jd-source-block">
                      <div className="jd-source-h">
                        <span>
                          <IconVideo size={14} /> {t('job.originalVideo')}
                        </span>
                        <span
                          className={
                            job.hasVideo ? 'nl-tag nl-tag-success' : 'nl-tag'
                          }
                        >
                          {job.hasVideo ? t('common.ready') : t('common.unreadied')}
                        </span>
                      </div>
                      {job.hasVideo ? (
                        <video
                          controls
                          playsInline
                          className="jd-video"
                          src={videoUrl(job.id)}
                        />
                      ) : (
                        <div className="jd-placeholder soft">{t('job.videoUnavailable')}</div>
                      )}
                    </div>
                    <div className="jd-source-block">
                      <div className="jd-source-h">
                        <span>
                          <IconWave size={14} /> {t('job.extractedAudio')}
                        </span>
                        <span
                          className={
                            job.hasSourceAudio
                              ? 'nl-tag nl-tag-success'
                              : 'nl-tag'
                          }
                        >
                          {job.hasSourceAudio ? t('common.ready') : t('common.unreadied')}
                        </span>
                      </div>
                      {job.hasSourceAudio ? (
                        <audio
                          controls
                          className="jd-audio"
                          src={sourceAudioUrl(job.id)}
                        />
                      ) : (
                        <div className="jd-placeholder soft">{t('job.audioMissingExtract')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="jd-side">
            <JobAssetsPanel job={job} />

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

            <section className="jd-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">{t('job.ttsConfig')}</h2>
                <span className="nl-chip">{t('common.readonly')}</span>
              </div>
              <TtsSummary value={job.tts} />
            </section>

            <section className="jd-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">{t('job.persona')}</h2>
                <span className="nl-chip">{t('common.readonly')}</span>
              </div>
              <ScriptPromptSummary value={job.scriptPrompt} />
            </section>

            <section className="jd-panel jd-meta-panel">
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
            </section>
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

