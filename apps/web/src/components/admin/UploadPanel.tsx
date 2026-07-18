import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createJob,
  createJobFromUrl,
  fetchAiSettings,
  fetchAlbums,
  fetchSourcePlugins,
  type SourcePluginDescriptor,
} from '../../api/client';
import type { AlbumSummary } from '../../types/album';
import { formatSize, formatSourceLabel } from '../../lib/format';
import {
  emptyScriptPrompt,
  summarizeScriptPrompt,
} from '../../lib/scriptPrompt';
import type {
  Job,
  ScriptPromptMode,
  ScriptPromptOptions,
  TtsOptions,
  TtsSourceMode,
} from '../../types/job';
import { ProgressBar } from '../ProgressBar';
import {
  IconCheck,
  IconMic,
  IconSpark,
  IconUpload,
  IconVideo,
} from '../icons';
import {
  loadGlobalScriptPrompt,
  ScriptPromptPicker,
} from './ScriptPromptPicker';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from './GlobalTtsSettings';
import { loadGlobalTts, TtsPicker } from './TtsPicker';
import { ContentLocaleSelect, contentLocaleLabel } from './ContentLocaleSelect';
import {
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../../i18n';

const ACCEPT = [
  // 视频
  '.mp4,.mov,.webm,.mkv,.avi,.m4v,.mpeg,.mpg,.ts,.flv,video/*',
  // 音频
  '.mp3,.m4a,.wav,.aac,.ogg,.flac,.opus,.wma,audio/*',
  // 文本
  '.txt,.md,.markdown,.html,.htm,.json,.csv,.xml,.log,.srt,.vtt,text/*',
].join(',');

type SourceMode = 'file' | 'url';
type OptionPanel = 'none' | 'tts' | 'prompt';

export function UploadPanel({ onCreated }: { onCreated: (job: Job) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const ttsRef = useRef<TtsOptions>(DEFAULT_GLOBAL_TTS);
  const ttsSourceModeRef = useRef<TtsSourceMode>('global');
  const publishedRef = useRef(true);
  const albumIdRef = useRef('');

  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [sourceUrl, setSourceUrl] = useState('');
  /** 空字符串 = 自动匹配 */
  const [sourcePluginId, setSourcePluginId] = useState('');
  const [sourcePlugins, setSourcePlugins] = useState<SourcePluginDescriptor[]>([]);
  const [sourcePluginsLoading, setSourcePluginsLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [tts, setTts] = useState<TtsOptions>(DEFAULT_GLOBAL_TTS);
  const [ttsSourceMode, setTtsSourceMode] = useState<TtsSourceMode>('global');
  const [globalTts, setGlobalTts] = useState<TtsOptions>(DEFAULT_GLOBAL_TTS);
  const [ttsReady, setTtsReady] = useState(false);
  const [published, setPublished] = useState(true);
  const [albumId, setAlbumId] = useState('');
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [contentLocale, setContentLocale] = useState<Locale>('zh-CN');
  const [globalContentLocale, setGlobalContentLocale] =
    useState<Locale>('zh-CN');
  const [contentLocaleReady, setContentLocaleReady] = useState(false);
  const [contentLocaleOptions, setContentLocaleOptions] = useState<
    Array<{ code: string; nativeLabel: string; label: string; short?: string }>
  >([]);
  const [scriptPromptMode, setScriptPromptMode] =
    useState<ScriptPromptMode>('global');
  const [scriptPrompt, setScriptPrompt] =
    useState<ScriptPromptOptions>(emptyScriptPrompt());
  const [globalScriptPrompt, setGlobalScriptPrompt] =
    useState<ScriptPromptOptions>(emptyScriptPrompt());
  const [scriptPromptReady, setScriptPromptReady] = useState(false);
  const [openPanel, setOpenPanel] = useState<OptionPanel>('none');

  const scriptPromptModeRef = useRef<ScriptPromptMode>('global');
  const scriptPromptRef = useRef<ScriptPromptOptions>(emptyScriptPrompt());
  const contentLocaleRef = useRef<Locale>('zh-CN');


  useEffect(() => {
    let cancelled = false;
    setAlbumsLoading(true);
    void fetchAlbums()
      .then((list) => {
        if (!cancelled) setAlbums(list);
      })
      .catch(() => {
        if (!cancelled) setAlbums([]);
      })
      .finally(() => {
        if (!cancelled) setAlbumsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    albumIdRef.current = albumId;
  }, [albumId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadGlobalScriptPrompt(),
      loadGlobalTts(),
      fetchAiSettings().catch(() => null),
    ]).then(([prompt, ttsCfg, ai]) => {
      if (cancelled) return;
      setGlobalScriptPrompt(prompt);
      setScriptPromptReady(true);
      setGlobalTts(ttsCfg);
      // 自定义草稿默认从全局复制，便于微调
      ttsRef.current = ttsCfg;
      setTts(ttsCfg);
      setTtsReady(true);
      const cl = resolveContentLocale(ai?.contentLocale);
      setGlobalContentLocale(cl);
      contentLocaleRef.current = cl;
      setContentLocale(cl);
      if (ai?.contentLocales) setContentLocaleOptions(ai.contentLocales);
      setContentLocaleReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (sourceMode !== 'url') return;
    let cancelled = false;
    setSourcePluginsLoading(true);
    void fetchSourcePlugins()
      .then((res) => {
        if (cancelled) return;
        const list = (res.plugins || []).filter(
          (p) =>
            p.enabled &&
            p.available &&
            !p.loadError &&
            p.capabilities.includes('url'),
        );
        setSourcePlugins(list);
        // 已选插件若失效则回退自动
        setSourcePluginId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : '',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSourcePlugins([]);
      })
      .finally(() => {
        if (!cancelled) setSourcePluginsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceMode]);

  const updateTts = useCallback((next: TtsOptions) => {
    ttsRef.current = next;
    setTts(next);
  }, []);

  const updateTtsSourceMode = useCallback((next: TtsSourceMode) => {
    ttsSourceModeRef.current = next;
    setTtsSourceMode(next);
  }, []);

  const updatePublished = useCallback((next: boolean) => {
    publishedRef.current = next;
    setPublished(next);
  }, []);

  const updateContentLocale = useCallback((next: Locale) => {
    contentLocaleRef.current = next;
    setContentLocale(next);
  }, []);

  const updateScriptPromptMode = useCallback((next: ScriptPromptMode) => {
    scriptPromptModeRef.current = next;
    setScriptPromptMode(next);
  }, []);

  const updateScriptPrompt = useCallback((next: ScriptPromptOptions) => {
    scriptPromptRef.current = next;
    setScriptPrompt(next);
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      const currentTtsSource = ttsSourceModeRef.current;
      const currentTts = ttsRef.current;
      const currentPublished = publishedRef.current;
      const currentPromptMode = scriptPromptModeRef.current;
      const currentPrompt = scriptPromptRef.current;

      setError(null);
      setFileName(file.name);
      setFileSize(file.size);
      setUploading(true);
      setProgress(0);
      setOpenPanel('none');
      try {
        const job = await createJob(file, {
          ttsSourceMode: currentTtsSource,
          tts: currentTtsSource === 'custom' ? currentTts : undefined,
          published: currentPublished,
          scriptPromptMode: currentPromptMode,
          scriptPrompt:
            currentPromptMode === 'custom' ? currentPrompt : undefined,
          locale: contentLocaleRef.current,
          albumId: albumIdRef.current || undefined,
          onProgress: setProgress,
        });
        onCreated(job);
        setProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onCreated],
  );

  const handleUrl = useCallback(async () => {
    const url = sourceUrl.trim();
    if (!url) {
      setError(t('upload.errUrlEmpty'));
      return;
    }
    // 自动匹配仍要求 http(s)；指定插件时由插件 canHandle 决定
    if (!sourcePluginId && !/^https?:\/\//i.test(url)) {
      setError(t('upload.errUrlScheme'));
      return;
    }

    const currentTtsSource = ttsSourceModeRef.current;
    const currentTts = ttsRef.current;
    const currentPublished = publishedRef.current;
    const currentPromptMode = scriptPromptModeRef.current;
    const currentPrompt = scriptPromptRef.current;
    const currentPluginId = sourcePluginId.trim() || undefined;

    setError(null);
    setFileName(url);
    setFileSize(null);
    setUploading(true);
    setProgress(12);
    setOpenPanel('none');
    try {
      const job = await createJobFromUrl(url, {
        ttsSourceMode: currentTtsSource,
        tts: currentTtsSource === 'custom' ? currentTts : undefined,
        published: currentPublished,
        scriptPromptMode: currentPromptMode,
        scriptPrompt:
          currentPromptMode === 'custom' ? currentPrompt : undefined,
        locale: contentLocaleRef.current,
        pluginId: currentPluginId,
        albumId: albumIdRef.current || undefined,
      });
      setProgress(100);
      onCreated(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [onCreated, sourcePluginId, sourceUrl, t]);

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const togglePanel = (panel: Exclude<OptionPanel, 'none'>) => {
    if (uploading) return;
    setOpenPanel((prev) => (prev === panel ? 'none' : panel));
  };

  const activeTts = ttsSourceMode === 'global' ? globalTts : tts;
  const ttsSummary = summarizeTts(activeTts);
  const ttsModeLabel = ttsSourceMode === 'global' ? t('common.global') : t('common.thisTime');
  const promptSummary = summarizeScriptPrompt(
    scriptPromptMode === 'global' ? globalScriptPrompt : scriptPrompt,
  );
  const promptModeLabel =
    scriptPromptMode === 'global' ? t('common.global') : t('common.thisTime');
  const contentLocaleDisplay = contentLocaleLabel(contentLocale);
  const contentLocaleHint =
    contentLocale === globalContentLocale
      ? t('upload.localeGlobal')
      : t('upload.localeCustom');

  return (
    <div className="upload-studio">
      {/* 1. 主操作：导入内容 */}
      <div className="upload-studio-main">
        <div className="upload-source-tabs" role="tablist" aria-label={t('upload.sourceAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'file'}
            className={['upload-source-tab', sourceMode === 'file' ? 'is-active' : ''].join(' ')}
            disabled={uploading}
            onClick={() => {
              setSourceMode('file');
              setError(null);
            }}
          >
            {t('upload.localFile')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'url'}
            className={['upload-source-tab', sourceMode === 'url' ? 'is-active' : ''].join(' ')}
            disabled={uploading}
            onClick={() => {
              setSourceMode('url');
              setError(null);
            }}
          >
            {t('upload.urlImport')}
          </button>
        </div>

        {sourceMode === 'file' ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('upload.dropAria')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }}
            onClick={openPicker}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading) void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={[
              'upload-dropzone',
              dragOver ? 'is-dragover' : '',
              uploading ? 'is-uploading' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="upload-dropzone-glow" aria-hidden />
            <div className="upload-dropzone-inner">
              <div className="upload-dropzone-icon">
                <IconUpload size={24} />
              </div>

              <div className="upload-dropzone-copy">
                <h2>{uploading ? t('upload.dropping') : t('upload.dropTitle')}</h2>
                <p>{t('upload.dropHint')}</p>
              </div>

              {!uploading && (
                <button
                  type="button"
                  className="nl-btn nl-btn-primary upload-dropzone-cta"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPicker();
                  }}
                >
                  <IconUpload size={15} />
                  {t('upload.chooseFile')}
                </button>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={uploading}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className={['upload-url-panel', uploading ? 'is-uploading' : ''].join(' ')}>
            <label className="upload-url-field">
              <span className="label">{t('upload.contentUrl')}</span>
              <input
                type="text"
                inputMode="url"
                className="nl-input"
                placeholder={t('upload.urlPlaceholder')}
                value={sourceUrl}
                disabled={uploading}
                onChange={(e) => setSourceUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleUrl();
                  }
                }}
              />
            </label>

            <label className="upload-url-field">
              <span className="label">{t('upload.sourcePlugin')}</span>
              <select
                className="nl-input upload-source-plugin-select"
                value={sourcePluginId}
                disabled={uploading || sourcePluginsLoading}
                onChange={(e) => setSourcePluginId(e.target.value)}
                aria-label={t('upload.sourcePlugin')}
              >
                <option value="">{t('upload.sourcePluginAuto')}</option>
                {sourcePlugins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.origin === 'builtin' ? ' · builtin' : ''}
                    {p.riskLevel === 'high' ? ' · high' : ''}
                  </option>
                ))}
              </select>
            </label>

            <p className="upload-url-hint">
              {sourcePluginsLoading
                ? t('upload.sourcePluginLoading')
                : sourcePlugins.length === 0
                  ? t('upload.sourcePluginUnavailable')
                  : t('upload.sourcePluginHint')}
              {!sourcePluginId ? ` ${t('upload.urlHint')}` : ''}
            </p>

            <button
              type="button"
              className="nl-btn nl-btn-primary upload-dropzone-cta"
              disabled={uploading || !sourceUrl.trim()}
              onClick={() => void handleUrl()}
            >
              <IconUpload size={15} />
              {uploading ? t('upload.submitting') : t('upload.start')}
            </button>
          </div>
        )}

        {(uploading || fileName) && (
          <div className="upload-progress-card">
            <div className="upload-file-row">
              <div className="upload-file-icon">
                <IconVideo size={18} />
              </div>
              <div className="upload-file-meta">
                <div className="upload-file-name" title={fileName || undefined}>{formatSourceLabel(fileName, 64)}</div>
                <div className="upload-file-sub">
                  {fileSize != null
                    ? formatSize(fileSize)
                    : sourceMode === 'url'
                      ? t('upload.urlImport')
                      : '—'}
                  <span className="dot">·</span>
                  {ttsSummary}
                  <span className="dot">·</span>
                  {contentLocaleDisplay}
                  <span className="dot">·</span>
                  {published ? t('upload.publishOn') : t('upload.publishOff')}
                </div>
              </div>
              <div className="upload-file-status">
                {uploading ? (
                  <span className="pct">{progress}%</span>
                ) : (
                  <span className="done">
                    <IconCheck size={14} />
                    {t('upload.submitted')}
                  </span>
                )}
              </div>
            </div>
            <ProgressBar value={uploading ? progress : 100} />
            <div className="upload-progress-hint">
              {uploading
                ? sourceMode === 'url'
                  ? t('upload.submittedUrl')
                   : t('upload.submittedUpload')
                 : t('upload.submittedRedirect')}
            </div>
          </div>
        )}

        {error && (
          <div className="upload-error" role="alert">
            <div className="upload-error-title">
              {sourceMode === 'url' ? t('upload.failUrl') : t('upload.failUpload')}
            </div>
            <div className="upload-error-msg">{error}</div>
            <button
              type="button"
              className="nl-btn nl-btn-secondary mt-3"
              onClick={() => {
                if (sourceMode === 'url') void handleUrl();
                else openPicker();
              }}
            >
              {t('common.retry')}
            </button>
          </div>
        )}
      </div>

      {/* 2. 精简选项：默认折叠，按需展开 */}
      <aside className="upload-options" aria-label={t('upload.optionsAria')}>
        <div className="upload-options-card">
          <label
            className={[
              'upload-switch-row upload-switch-row-compact',
              uploading ? 'is-locked' : '',
            ].join(' ')}
          >
            <div className="upload-switch-copy">
              <div className="title">{t('upload.autoPublish')}</div>
            </div>
            <span className={['upload-switch', published ? 'is-on' : ''].join(' ')}>
              <i />
              <input
                type="checkbox"
                className="upload-switch-input"
                checked={published}
                disabled={uploading}
                onChange={(e) => updatePublished(e.target.checked)}
                aria-label={t('upload.autoPublish')}
              />
            </span>
          </label>

          <div className="upload-album-row">
            <div className="upload-locale-head">
              <span className="title">{t('upload.album')}</span>
              <span className="desc">
                {albumsLoading
                  ? t('upload.albumLoading')
                  : albums.length
                    ? t('upload.albumHint')
                    : t('upload.albumEmpty')}
              </span>
            </div>
            <select
              className="nl-input upload-locale-select"
              value={albumId}
              disabled={uploading || albumsLoading}
              onChange={(e) => setAlbumId(e.target.value)}
              aria-label={t('upload.album')}
            >
              <option value="">{t('upload.albumNone')}</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {!a.published ? ` (${t('album.draft')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="upload-locale-row">
            <div className="upload-locale-head">
              <span className="title">{t('upload.contentLocale')}</span>
              <span className="desc">
                {contentLocaleReady
                  ? contentLocaleHint
                  : t('upload.localeLoading')}
              </span>
            </div>
            <ContentLocaleSelect
              className="upload-locale-select"
              value={contentLocale}
              options={contentLocaleOptions}
              disabled={uploading || !contentLocaleReady}
              aria-label={t('upload.contentLocaleAria')}
              onChange={updateContentLocale}
            />
          </div>

          <div className="upload-option-chips" role="group" aria-label={t('upload.advancedAria')}>
            <button
              type="button"
              className={[
                'upload-option-chip',
                openPanel === 'tts' ? 'is-open' : '',
              ].join(' ')}
              disabled={uploading || !ttsReady}
              aria-expanded={openPanel === 'tts'}
              onClick={() => togglePanel('tts')}
            >
              <IconMic size={13} />
              <span className="chip-label">{t('upload.voice')}</span>
              <span className="chip-value" title={`${ttsModeLabel} · ${ttsSummary}`}>
                {ttsModeLabel} · {ttsSummary}
              </span>
              <span className="chip-caret" aria-hidden>
                {openPanel === 'tts' ? t('common.collapse') : t('common.adjust')}
              </span>
            </button>

            <button
              type="button"
              className={[
                'upload-option-chip',
                openPanel === 'prompt' ? 'is-open' : '',
              ].join(' ')}
              disabled={uploading || !scriptPromptReady}
              aria-expanded={openPanel === 'prompt'}
              onClick={() => togglePanel('prompt')}
            >
              <IconSpark size={13} />
              <span className="chip-label">{t('upload.persona')}</span>
              <span className="chip-value" title={`${promptModeLabel} · ${promptSummary}`}>
                {promptModeLabel} · {promptSummary}
              </span>
              <span className="chip-caret" aria-hidden>
                {openPanel === 'prompt' ? t('common.collapse') : t('common.adjust')}
              </span>
            </button>
          </div>

          {openPanel === 'tts' && (
            <div className="upload-option-panel" onClick={(e) => e.stopPropagation()}>
              <div className="upload-option-panel-head">
                <div className="left">
                  <IconMic size={14} />
                  <span>{t('upload.voice')}</span>
                </div>
                <button
                  type="button"
                  className="upload-option-close"
                  onClick={() => setOpenPanel('none')}
                >
                  {t('common.done')}
                </button>
              </div>
              <TtsPicker
                mode={ttsSourceMode}
                value={tts}
                globalValue={globalTts}
                disabled={uploading || !ttsReady}
                compact
                onModeChange={updateTtsSourceMode}
                onChange={updateTts}
              />
            </div>
          )}

          {openPanel === 'prompt' && (
            <div className="upload-option-panel">
              <div className="upload-option-panel-head">
                <div className="left">
                  <IconSpark size={14} />
                  <span>{t('upload.scriptPersona')}</span>
                </div>
                <button
                  type="button"
                  className="upload-option-close"
                  onClick={() => setOpenPanel('none')}
                >
                  {t('common.done')}
                </button>
              </div>
              <ScriptPromptPicker
                mode={scriptPromptMode}
                value={scriptPrompt}
                globalValue={globalScriptPrompt}
                disabled={uploading || !scriptPromptReady}
                compact
                onModeChange={updateScriptPromptMode}
                onChange={updateScriptPrompt}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
