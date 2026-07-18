import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createJob,
  createJobFromUrl,
  fetchAiSettings,
  fetchAllAlbums,
  fetchSourcePlugins,
  type SourcePluginDescriptor,
} from '../../api/client';
import type { AlbumSummary } from '../../types/album';
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
import { loadGlobalScriptPrompt } from './ScriptPromptPicker';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from './GlobalTtsSettings';
import { loadGlobalTts } from './TtsPicker';
import { contentLocaleLabel } from './ContentLocaleSelect';
import {
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../../i18n';

import {
  type OptionPanel,
  type SourceMode,
} from '../../features/upload/constants';
import { UploadSourceTabs } from '../../features/upload/UploadSourceTabs';
import { UploadFileDropzone } from '../../features/upload/UploadFileDropzone';
import { UploadUrlPanel } from '../../features/upload/UploadUrlPanel';
import { UploadProgressCard } from '../../features/upload/UploadProgressCard';
import { UploadOptionsAside } from '../../features/upload/UploadOptionsAside';

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
  const [optionsOpen, setOptionsOpen] = useState(false);

  const scriptPromptModeRef = useRef<ScriptPromptMode>('global');
  const scriptPromptRef = useRef<ScriptPromptOptions>(emptyScriptPrompt());
  const contentLocaleRef = useRef<Locale>('zh-CN');


  useEffect(() => {
    let cancelled = false;
    setAlbumsLoading(true);
    void fetchAllAlbums()
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
      <div className="upload-studio-main">
        <UploadSourceTabs
          sourceMode={sourceMode}
          uploading={uploading}
          onChange={(mode) => {
            setSourceMode(mode);
            setError(null);
          }}
        />

        {sourceMode === 'file' ? (
          <UploadFileDropzone
            uploading={uploading}
            dragOver={dragOver}
            inputRef={inputRef}
            onOpenPicker={openPicker}
            onDragOver={setDragOver}
            onDropFile={(file) => void handleFile(file)}
            onPickFile={(file) => void handleFile(file)}
          />
        ) : (
          <UploadUrlPanel
            uploading={uploading}
            sourceUrl={sourceUrl}
            sourcePluginId={sourcePluginId}
            sourcePlugins={sourcePlugins}
            sourcePluginsLoading={sourcePluginsLoading}
            onUrlChange={setSourceUrl}
            onPluginChange={setSourcePluginId}
            onSubmit={() => void handleUrl()}
          />
        )}

        {(uploading || fileName) && (
          <UploadProgressCard
            uploading={uploading}
            progress={progress}
            fileName={fileName}
            fileSize={fileSize}
            sourceMode={sourceMode}
            ttsSummary={ttsSummary}
            contentLocaleDisplay={contentLocaleDisplay}
            published={published}
          />
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

      <UploadOptionsAside
        uploading={uploading}
        optionsOpen={optionsOpen}
        setOptionsOpen={setOptionsOpen}
        published={published}
        updatePublished={updatePublished}
        albumId={albumId}
        setAlbumId={setAlbumId}
        albums={albums}
        albumsLoading={albumsLoading}
        contentLocale={contentLocale}
        contentLocaleOptions={contentLocaleOptions}
        contentLocaleReady={contentLocaleReady}
        contentLocaleHint={contentLocaleHint}
        contentLocaleDisplay={contentLocaleDisplay}
        updateContentLocale={updateContentLocale}
        openPanel={openPanel}
        setOpenPanel={setOpenPanel}
        togglePanel={togglePanel}
        ttsModeLabel={ttsModeLabel}
        ttsSummary={ttsSummary}
        ttsSourceMode={ttsSourceMode}
        tts={tts}
        globalTts={globalTts}
        ttsReady={ttsReady}
        updateTtsSourceMode={updateTtsSourceMode}
        updateTts={updateTts}
        promptModeLabel={promptModeLabel}
        promptSummary={promptSummary}
        scriptPromptMode={scriptPromptMode}
        scriptPrompt={scriptPrompt}
        globalScriptPrompt={globalScriptPrompt}
        scriptPromptReady={scriptPromptReady}
        updateScriptPromptMode={updateScriptPromptMode}
        updateScriptPrompt={updateScriptPrompt}
      />

    </div>
  );
}