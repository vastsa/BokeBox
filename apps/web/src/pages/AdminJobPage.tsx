import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  deleteJob,
  fetchJob,
  generateFlashcards,
  podcastAudioUrl,
  retryJob,
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
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  IconDownload,
  IconMic,
  IconRefresh,
  IconSpark,
  IconText,
  IconTrash,
  IconVideo,
  IconWave,
} from '../components/icons';
import { coverGradientFor, formatSize, formatSourceLabel, formatTime } from '../lib/format';
import { CoverArt } from '../components/ui/CoverArt';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus, PipelineFromStep } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { AdminChrome } from '../components/admin/AdminChrome';
import {
  ContentLocaleSelect,
  contentLocaleLabel,
} from '../components/admin/ContentLocaleSelect';
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

const PIPELINE: Array<{ key: string; labelKey: string; match: JobStatus[] }> = [
  { key: 'queued', labelKey: 'statusShort.queued', match: ['queued'] },
  { key: 'extracting_audio', labelKey: 'statusShort.extracting_audio', match: ['extracting_audio'] },
  { key: 'transcribing', labelKey: 'statusShort.transcribing', match: ['transcribing'] },
  { key: 'generating_podcast', labelKey: 'statusShort.generating_podcast', match: ['generating_podcast'] },
  { key: 'generating_cover', labelKey: 'statusShort.generating_cover', match: ['generating_cover'] },
  { key: 'synthesizing_audio', labelKey: 'statusShort.synthesizing_audio', match: ['synthesizing_audio'] },
  { key: 'done', labelKey: 'statusShort.done', match: ['done'] },
];

const ACTIVE_STATUSES: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

const RERUN_STEPS: Array<{
  key: PipelineFromStep;
  labelKey: string;
  descKey: string;
  /** 需要哪些已有资产才能选该起点 */
  requires: Array<'audio' | 'transcript' | 'script'>;
}> = [
  {
    key: 'extract',
    labelKey: 'job.stepExtract',
    descKey: 'job.stepExtractDesc',
    requires: [],
  },
  {
    key: 'transcribe',
    labelKey: 'job.stepTranscribe',
    descKey: 'job.stepTranscribeDesc',
    requires: ['audio'],
  },
  {
    key: 'script',
    labelKey: 'job.stepGenerate',
    descKey: 'job.stepGenerateDesc',
    requires: ['audio', 'transcript'],
  },
  {
    key: 'cover',
    labelKey: 'job.stepCover',
    descKey: 'job.stepCoverDesc',
    requires: ['script'],
  },
  {
    key: 'flashcards',
    labelKey: 'job.stepFlashcards',
    descKey: 'job.stepFlashcardsDesc',
    requires: ['transcript', 'script'],
  },
  {
    key: 'synthesize',
    labelKey: 'job.stepSynthesize',
    descKey: 'job.stepSynthesizeDesc',
    requires: ['audio', 'script'],
  },
];

function pickDefaultFromStep(job: Job): PipelineFromStep {
  const hasAudio = Boolean(job.hasSourceAudio);
  const hasTranscript = Boolean(job.hasTranscript || job.transcript?.trim());
  const hasScript = Boolean(job.podcast?.script?.trim());
  const hasCards = Boolean(job.podcast?.flashcards?.length);
  const hasCover = Boolean(job.podcast?.hasCoverImage);
  // 有脚本无封面时优先补封面
  if (hasScript && !hasCover) return 'cover';
  // 有脚本无闪卡时，默认补闪卡更省时
  if (hasScript && hasTranscript && !hasCards) return 'flashcards';
  if (hasScript && hasAudio) return 'synthesize';
  if (hasTranscript && hasAudio) return 'script';
  if (hasAudio) return 'transcribe';
  return 'extract';
}

function canSelectFromStep(job: Job, step: PipelineFromStep): boolean {
  const meta = RERUN_STEPS.find((s) => s.key === step);
  if (!meta) return false;
  const hasAudio = Boolean(job.hasSourceAudio);
  const hasTranscript = Boolean(job.hasTranscript || job.transcript?.trim());
  const hasScript = Boolean(job.podcast?.script?.trim());
  // 文本任务无源音频也可生成脚本/闪卡；合成仍建议有占位音频，但后端可处理
  const kind = job.sourceKind || 'video';
  for (const req of meta.requires) {
    if (req === 'audio') {
      if (!hasAudio && kind !== 'text') return false;
      // 闪卡不需要 audio；script 在 text 下也不强制
      if (!hasAudio && kind === 'text' && step === 'synthesize') {
        // 允许：演示/真实 TTS 多数不依赖源音频内容
      }
    }
    if (req === 'transcript' && !hasTranscript) return false;
    if (req === 'script' && !hasScript) return false;
  }
  return true;
}

function pipelineIndex(status: JobStatus): number {
  if (status === 'failed') return -1;
  if (status === 'done') return PIPELINE.length - 1;
  const idx = PIPELINE.findIndex((s) => s.match.includes(status));
  return idx >= 0 ? idx : 0;
}

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
        title={title}
        subtitle={t('admin.jobDetailSub')}
      >
      <div className="admin-container nl-enter jd-page">
        {/* 顶栏信息 */}
        <header className="jd-hero">
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
            imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt, 'md') : undefined}
            title={title}
            className="jd-cover"
            aria-hidden
          >
            <IconMic size={28} />
          </CoverArt>

          <div className="jd-hero-main">
            <div className="jd-badges">
              <StatusBadge status={job.status} />
              <span className={['nl-tag', job.published ? 'nl-tag-success' : ''].join(' ')}>
                {job.published ? t('admin.published') : t('admin.unpublished')}
              </span>
            </div>
            <h1 className="jd-title">{title}</h1>
            <p className="jd-sub">
              <span>{job.message || t('job.waiting')}</span>
            </p>
            <p className="jd-meta">
              <span
                className="jd-source-label truncate"
                title={job.sourceUrl || job.originalFilename}
              >
                {formatSourceLabel(job.sourceUrl || job.originalFilename)}
              </span>
              <span>{formatSize(job.size)}</span>
              <span>{formatTime(job.createdAt)}</span>
              <span className="mono">#{job.id}</span>
            </p>
          </div>

          <div className="jd-hero-actions">
            {canListen && (
              <button
                type="button"
                className="nl-btn nl-btn-primary"
                onClick={() => navigate({ name: 'player', id: job.id })}
              >
                {t('job.openPlayer')}
              </button>
            )}
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
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
                  ? t('job.unpublish')
                   : t('job.publishToLib')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-ghost"
              onClick={() => void refresh()}
            >
              <IconRefresh size={15} />
            </button>
          </div>

          {(showPipeline || job.progress < 100 || job.status === 'failed') && (
            <div className="jd-progress">
              <div className="jd-progress-row">
                <span>{active ? t('job.processing') : job.status === 'failed' ? t('job.failedState') : t('job.progress')}</span>
                <span>{Math.round(job.progress)}%</span>
              </div>
              <ProgressBar
                value={job.progress}
                tone={job.status === 'failed' ? 'danger' : 'brand'}
              />
              {showPipeline && (
                <div className="jd-steps">
                  {PIPELINE.map((step, i) => {
                    const failed = job.status === 'failed';
                    const done =
                      !failed &&
                      (job.status === 'done' || (stepIdx >= 0 && i < stepIdx));
                    const current =
                      !failed &&
                      stepIdx >= 0 &&
                      i === stepIdx &&
                      job.status !== 'done';
                    return (
                      <div
                        key={step.key}
                        className={[
                          'jd-step',
                          done ? 'is-done' : '',
                          current ? 'is-current' : '',
                          failed ? 'is-muted' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <i />
                        <span>{t(step.labelKey)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(job.error || actionError) && (
            <div className="jd-alert jd-break" role="alert">
              <strong>{job.error ? t('job.processFailed') : t('job.actionFailed')}</strong>
              <p>{job.error || actionError}</p>
            </div>
          )}
        </header>

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
            <section className="jd-panel">
              <h2 className="jd-side-title">{t('job.assetsTitle')}</h2>
              <div className="jd-assets">
                <AssetRow
                  icon={<IconVideo size={14} />}
                  label={t('job.originalVideo')}
                  ready={Boolean(job.hasVideo)}
                />
                <AssetRow
                  icon={<IconWave size={14} />}
                  label={t('job.extractedAudio')}
                  ready={Boolean(job.hasSourceAudio)}
                />
                <AssetRow
                  icon={<IconText size={14} />}
                  label={t('job.stepTranscribe')}
                  ready={Boolean(job.hasTranscript || job.transcript)}
                />
                <AssetRow
                  icon={<IconMic size={14} />}
                  label={t('job.podcastAudio')}
                  ready={Boolean(job.hasPodcastAudio)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label={t('job.scriptNotes')}
                  ready={Boolean(job.podcast?.script || job.podcast?.showNotes)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label={t('job.knowledgeCards')}
                  ready={Boolean(job.podcast?.flashcards?.length)}
                />

              </div>
            </section>

            <section className="jd-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">{t('job.contentLocale')}</h2>
                <span className="nl-chip">
                  {contentLocaleLabel(job.locale)}
                </span>
              </div>
              <p className="jd-hint jd-hint-top">{t('job.contentLocaleHint')}</p>
            </section>

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

            <section className="jd-panel">
              <h2 className="jd-side-title">{t('job.reprocess')}</h2>
              <div className="jd-ops">
                <p className="jd-hint jd-hint-top">
                  {t('job.reprocessHint')}
                </p>

                <label className="jd-select-field">
                  <span className="jd-select-label">{t('job.contentLocale')}</span>
                  <ContentLocaleSelect
                    value={jobContentLocale}
                    disabled={active || Boolean(busy)}
                    aria-label={t('job.contentLocaleAria')}
                    onChange={setJobContentLocale}
                  />
                </label>
                <p className="jd-select-desc">{t('job.contentLocaleRerunHint')}</p>

                <label className="jd-select-field">
                  <span className="jd-select-label">{t('job.fromStep')}</span>
                  <select
                    className="jd-select"
                    value={fromStep}
                    disabled={active || Boolean(busy)}
                    aria-label={t('job.fromStepAria')}
                    onChange={(e) =>
                      setFromStep(e.target.value as PipelineFromStep)
                    }
                  >
                    {RERUN_STEPS.map((step) => {
                      const enabled = canSelectFromStep(job, step.key);
                      return (
                        <option
                          key={step.key}
                          value={step.key}
                          disabled={!enabled}
                        >
                          {t(step.labelKey)}
                          {!enabled ? t('job.missingPrereq') : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {selectedMeta && (
                  <p className="jd-select-desc">{t(selectedMeta.descKey)}</p>
                )}

                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  disabled={!canRerun || !selectedStepOk || busy === 'retry'}
                  onClick={() =>
                    void runAction('retry', () =>
                      retryJob(job.id, {
                        tts: job.tts,
                        fromStep,
                        locale: jobContentLocale,
                      }),
                    )
                  }
                >
                  <IconRefresh size={14} />
                  {busy === 'retry'
                    ? t('common.processingEllipsis')
                    : t('job.startFrom', { label: selectedMeta ? t(selectedMeta.labelKey) : t('job.startPoint') })}
                </button>
                <p className="jd-hint">
                  {fromStep === 'extract' && t('job.hintExtract')}
                  {fromStep === 'transcribe' && t('job.hintTranscribe')}
                  {fromStep === 'script' &&
                    t('job.hintGenerate')}
                  {fromStep === 'cover' &&
                    t('job.hintCover')}
                  {fromStep === 'flashcards' &&
                    t('job.hintFlashcards')}
                  {fromStep === 'synthesize' && t('job.hintSynthesize')}
                </p>

                <div className="jd-danger">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="nl-btn nl-btn-danger"
                      disabled={Boolean(busy)}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <IconTrash size={14} />
                      {t('job.deleteJob')}
                    </button>
                  ) : (
                    <div className="jd-confirm">
                      <strong>{t('job.deleteConfirmTitle')}</strong>
                      <p>{t('job.deleteConfirmBody')}</p>
                      <div className="jd-confirm-actions">
                        <button
                          type="button"
                          className="nl-btn nl-btn-danger"
                          disabled={busy === 'delete'}
                          onClick={() =>
                            void runAction('delete', () => deleteJob(job.id))
                          }
                        >
                          {busy === 'delete' ? t('common.deleting') : t('common.confirmDelete')}
                        </button>
                        <button
                          type="button"
                          className="nl-btn nl-btn-secondary"
                          disabled={busy === 'delete'}
                          onClick={() => setConfirmDelete(false)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
      </div>
      </AdminChrome>
    </AppShell>
  );
}

function AssetRow({
  icon,
  label,
  ready,
}: {
  icon: ReactNode;
  label: string;
  ready: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={['jd-asset', ready ? 'is-ready' : ''].join(' ')}>
      <span className="ic">{icon}</span>
      <span className="lb">{label}</span>
      <span className="st">{ready ? t('common.ready') : t('common.unreadied')}</span>
    </div>
  );
}
