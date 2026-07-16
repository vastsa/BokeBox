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
} from '../api/client';
import { FlashcardsView } from '../components/FlashcardsView';
import { ScriptPromptSummary } from '../components/admin/ScriptPromptSummary';
import { TtsSummary } from '../components/admin/TtsSummary';
import { MiniPlayer } from '../components/listen/MiniPlayer';
import { ScriptFollow } from '../components/listen/ScriptFollow';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  IconBack,
  IconDownload,
  IconMic,
  IconRefresh,
  IconSpark,
  IconText,
  IconTrash,
  IconVideo,
  IconWave,
} from '../components/icons';
import { coverGradientFor, formatSize, formatTime } from '../lib/format';
import { CoverArt } from '../components/ui/CoverArt';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus, PipelineFromStep } from '../types/job';
import { AppShell } from '../layouts/AppShell';

type ContentTab = 'script' | 'notes' | 'flashcards' | 'transcript' | 'source';

const CONTENT_TABS: Array<{ key: ContentTab; label: string }> = [
  { key: 'script', label: '口播脚本' },
  { key: 'notes', label: '节目笔记' },
  { key: 'flashcards', label: '知识闪卡' },
  { key: 'transcript', label: '原转写' },
  { key: 'source', label: '源素材' },
];

const PIPELINE: Array<{ key: string; label: string; match: JobStatus[] }> = [
  { key: 'queued', label: '排队', match: ['queued'] },
  { key: 'extracting_audio', label: '提音频', match: ['extracting_audio'] },
  { key: 'transcribing', label: '转写', match: ['transcribing'] },
  { key: 'generating_podcast', label: '脚本', match: ['generating_podcast'] },
  { key: 'synthesizing_audio', label: '合成', match: ['synthesizing_audio'] },
  { key: 'done', label: '完成', match: ['done'] },
];

const ACTIVE_STATUSES: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'synthesizing_audio',
];

const RERUN_STEPS: Array<{
  key: PipelineFromStep;
  label: string;
  desc: string;
  /** 需要哪些已有资产才能选该起点 */
  requires: Array<'audio' | 'transcript' | 'script'>;
}> = [
  {
    key: 'extract',
    label: '提取音频',
    desc: '从源视频重新提取，完整重跑后续步骤',
    requires: [],
  },
  {
    key: 'transcribe',
    label: '转写文字',
    desc: '复用已有音频，跳过提取',
    requires: ['audio'],
  },
  {
    key: 'script',
    label: '生成脚本',
    desc: '复用音频 + 转写，重做脚本 / 笔记 / 闪卡 / 合成',
    requires: ['audio', 'transcript'],
  },
  {
    key: 'flashcards',
    label: '知识闪卡',
    desc: '复用脚本与笔记，仅重新生成知识闪卡',
    requires: ['transcript', 'script'],
  },
  {
    key: 'synthesize',
    label: '合成音频',
    desc: '复用脚本，仅重新 TTS',
    requires: ['audio', 'script'],
  },
];

function pickDefaultFromStep(job: Job): PipelineFromStep {
  const hasAudio = Boolean(job.hasSourceAudio);
  const hasTranscript = Boolean(job.hasTranscript || job.transcript?.trim());
  const hasScript = Boolean(job.podcast?.script?.trim());
  const hasCards = Boolean(job.podcast?.flashcards?.length);
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
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'publish' | 'retry' | 'delete' | 'flashcards' | null>(null);
  const [fromStep, setFromStep] = useState<PipelineFromStep>('extract');
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
              onClick={() => navigate({ name: 'home' })}
            >
              返回首页
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
        navigate({ name: 'home' });
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
      <div className="admin-container nl-enter jd-page">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="jd-back"
        >
          <IconBack size={16} />
          返回首页
        </button>

        {/* 顶栏信息 */}
        <header className="jd-hero">
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
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
                {job.published ? '已发布' : '未发布'}
              </span>
            </div>
            <h1 className="jd-title">{title}</h1>
            <p className="jd-sub">
              <span>{job.message || '等待处理…'}</span>
            </p>
            <p className="jd-meta">
              <span className="truncate">{job.originalFilename}</span>
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
                打开播放
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
                ? '更新中…'
                : job.published
                  ? '取消发布'
                  : '发布到库'}
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
                <span>{active ? '处理中' : job.status === 'failed' ? '已失败' : '进度'}</span>
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
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(job.error || actionError) && (
            <div className="jd-alert" role="alert">
              <strong>{job.error ? '处理失败' : '操作失败'}</strong>
              <p>{job.error || actionError}</p>
            </div>
          )}
        </header>

        <div className="jd-layout">
          <div className="jd-main">
            {/* 播放 + 摘要 */}
            <section className="jd-panel">
              <div className="jd-panel-head">
                <h2>播客成果</h2>
                <div className="jd-panel-actions">
                  {job.hasPodcastAudio && (
                    <a
                      href={podcastAudioUrl(job.id, true)}
                      className="nl-btn nl-btn-secondary"
                    >
                      <IconDownload size={14} />
                      下载
                    </a>
                  )}
                  {canListen && (
                    <button
                      type="button"
                      className="nl-btn nl-btn-ghost"
                      onClick={() => navigate({ name: 'player', id: job.id })}
                    >
                      沉浸播放
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
                  summary={job.podcast?.summary}
                  seekRequest={seekRequest}
                  onStateChange={setPlayState}
                />
              ) : (
                <div className="jd-placeholder">
                  <IconWave size={18} />
                  <span>{active ? '播客音频生成中…' : '尚未生成播客音频'}</span>
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
                  <div className="jd-outline-h">内容大纲</div>
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
                      {item.label}
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
                    {followScript ? '跟读中' : '边听边看'}
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
                    <div className="jd-placeholder soft">口播脚本尚未生成</div>
                  ))}

                {tab === 'notes' && (
                  <article className="prose-soft max-w-none">
                    {job.podcast?.showNotes ? (
                      <ReactMarkdown>{job.podcast.showNotes}</ReactMarkdown>
                    ) : (
                      <div className="jd-placeholder soft">暂无节目笔记</div>
                    )}
                  </article>
                )}

                {tab === 'flashcards' && (
                  <div className="jd-flashcards">
                    <div className="jd-flashcards-bar">
                      <p className="jd-hint jd-hint-top">
                        知识闪卡由独立 AI 生成，适合主动回忆复习。
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
                          ? '生成中…'
                          : job.podcast?.flashcards?.length
                            ? '重新生成'
                            : 'AI 生成闪卡'}
                      </button>
                    </div>
                    <FlashcardsView
                      cards={job.podcast?.flashcards}
                      emptyText="暂无知识闪卡，可点击上方按钮单独生成"
                    />
                  </div>
                )}

                {tab === 'transcript' && (
                  <pre className="jd-pre">
                    {job.transcript || '转写文字尚未生成'}
                  </pre>
                )}

                {tab === 'source' && (
                  <div className="jd-source">
                    <div className="jd-source-block">
                      <div className="jd-source-h">
                        <span>
                          <IconVideo size={14} /> 原始视频
                        </span>
                        <span
                          className={
                            job.hasVideo ? 'nl-tag nl-tag-success' : 'nl-tag'
                          }
                        >
                          {job.hasVideo ? '就绪' : '未就绪'}
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
                        <div className="jd-placeholder soft">视频不可用</div>
                      )}
                    </div>
                    <div className="jd-source-block">
                      <div className="jd-source-h">
                        <span>
                          <IconWave size={14} /> 提取音频
                        </span>
                        <span
                          className={
                            job.hasSourceAudio
                              ? 'nl-tag nl-tag-success'
                              : 'nl-tag'
                          }
                        >
                          {job.hasSourceAudio ? '就绪' : '未就绪'}
                        </span>
                      </div>
                      {job.hasSourceAudio ? (
                        <audio
                          controls
                          className="jd-audio"
                          src={sourceAudioUrl(job.id)}
                        />
                      ) : (
                        <div className="jd-placeholder soft">音频尚未提取</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="jd-side">
            <section className="jd-panel">
              <h2 className="jd-side-title">资产状态</h2>
              <div className="jd-assets">
                <AssetRow
                  icon={<IconVideo size={14} />}
                  label="原始视频"
                  ready={Boolean(job.hasVideo)}
                />
                <AssetRow
                  icon={<IconWave size={14} />}
                  label="提取音频"
                  ready={Boolean(job.hasSourceAudio)}
                />
                <AssetRow
                  icon={<IconText size={14} />}
                  label="转写文字"
                  ready={Boolean(job.hasTranscript || job.transcript)}
                />
                <AssetRow
                  icon={<IconMic size={14} />}
                  label="播客音频"
                  ready={Boolean(job.hasPodcastAudio)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label="脚本 / 笔记"
                  ready={Boolean(job.podcast?.script || job.podcast?.showNotes)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label="知识闪卡"
                  ready={Boolean(job.podcast?.flashcards?.length)}
                />

              </div>
            </section>

            <section className="jd-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">TTS 配置</h2>
                <span className="nl-chip">只读</span>
              </div>
              <TtsSummary value={job.tts} />
            </section>

            <section className="jd-panel">
              <div className="jd-side-head">
                <h2 className="jd-side-title">口播人设</h2>
                <span className="nl-chip">只读</span>
              </div>
              <ScriptPromptSummary value={job.scriptPrompt} />
            </section>

            <section className="jd-panel">
              <h2 className="jd-side-title">重新处理</h2>
              <div className="jd-ops">
                <p className="jd-hint jd-hint-top">
                  选择处理起点，已完成步骤可跳过，避免重复耗时操作
                </p>

                <label className="jd-select-field">
                  <span className="jd-select-label">处理起点</span>
                  <select
                    className="jd-select"
                    value={fromStep}
                    disabled={active || Boolean(busy)}
                    aria-label="重跑起点"
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
                          {step.label}
                          {!enabled ? '（缺前置）' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {selectedMeta && (
                  <p className="jd-select-desc">{selectedMeta.desc}</p>
                )}

                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  disabled={!canRerun || !selectedStepOk || busy === 'retry'}
                  onClick={() =>
                    void runAction('retry', () =>
                      retryJob(job.id, { tts: job.tts, fromStep }),
                    )
                  }
                >
                  <IconRefresh size={14} />
                  {busy === 'retry'
                    ? '处理中…'
                    : `从「${selectedMeta?.label || '起点'}」开始`}
                </button>
                <p className="jd-hint">
                  {fromStep === 'extract' && '将重新提取音频并完整重跑后续步骤'}
                  {fromStep === 'transcribe' && '保留源音频，从转写开始重跑'}
                  {fromStep === 'script' &&
                    '保留音频与转写，重新生成脚本、笔记、闪卡并合成'}
                  {fromStep === 'flashcards' &&
                    '保留脚本与笔记，仅重新生成知识闪卡（不重跑 TTS）'}
                  {fromStep === 'synthesize' && '保留脚本，仅按当前 TTS 配置重合成'}
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
                      删除任务
                    </button>
                  ) : (
                    <div className="jd-confirm">
                      <strong>确认删除？</strong>
                      <p>将移除全部文件与生成结果，不可恢复。</p>
                      <div className="jd-confirm-actions">
                        <button
                          type="button"
                          className="nl-btn nl-btn-danger"
                          disabled={busy === 'delete'}
                          onClick={() =>
                            void runAction('delete', () => deleteJob(job.id))
                          }
                        >
                          {busy === 'delete' ? '删除中…' : '确认删除'}
                        </button>
                        <button
                          type="button"
                          className="nl-btn nl-btn-secondary"
                          disabled={busy === 'delete'}
                          onClick={() => setConfirmDelete(false)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="jd-panel jd-meta-panel">
              <div>
                <span>创建</span>
                <b>{formatTime(job.createdAt)}</b>
              </div>
              <div>
                <span>更新</span>
                <b>{formatTime(job.updatedAt)}</b>
              </div>
              <div>
                <span>类型</span>
                <b>{job.mimeType || '—'}</b>
              </div>
              <div>
                <span>预估</span>
                <b>
                  {job.podcast?.estimatedMinutes
                    ? `${job.podcast.estimatedMinutes} 分钟`
                    : '—'}
                </b>
              </div>
            </section>
          </aside>
        </div>
      </div>
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
  return (
    <div className={['jd-asset', ready ? 'is-ready' : ''].join(' ')}>
      <span className="ic">{icon}</span>
      <span className="lb">{label}</span>
      <span className="st">{ready ? '就绪' : '未就绪'}</span>
    </div>
  );
}
