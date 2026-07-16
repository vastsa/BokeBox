import { useCallback, useEffect, useRef, useState } from 'react';
import { createJob, createJobFromUrl } from '../../api/client';
import { formatSize } from '../../lib/format';
import {
  emptyScriptPrompt,
  summarizeScriptPrompt,
} from '../../lib/scriptPrompt';
import type {
  Job,
  ScriptPromptMode,
  ScriptPromptOptions,
  TtsOptions,
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
import { TtsModePicker } from './TtsModePicker';
import { TtsSummary } from './TtsSummary';

const ACCEPT = [
  // 视频
  '.mp4,.mov,.webm,.mkv,.avi,.m4v,.mpeg,.mpg,.ts,.flv,video/*',
  // 音频
  '.mp3,.m4a,.wav,.aac,.ogg,.flac,.opus,.wma,audio/*',
  // 文本
  '.txt,.md,.markdown,.html,.htm,.json,.csv,.xml,.log,.srt,.vtt,text/*',
].join(',');

const DEFAULT_TTS: TtsOptions = {
  mode: 'default',
  voice: '冰糖',
  voiceDesign: '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力',
};

const MODE_LABEL: Record<string, string> = {
  default: '自然口播',
  voicedesign: '自定义音色',
};

type SourceMode = 'file' | 'url';

export function UploadPanel({ onCreated }: { onCreated: (job: Job) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ttsRef = useRef<TtsOptions>(DEFAULT_TTS);
  const publishedRef = useRef(true);

  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [sourceUrl, setSourceUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [tts, setTts] = useState<TtsOptions>(DEFAULT_TTS);
  const [published, setPublished] = useState(true);
  const [scriptPromptMode, setScriptPromptMode] =
    useState<ScriptPromptMode>('global');
  const [scriptPrompt, setScriptPrompt] =
    useState<ScriptPromptOptions>(emptyScriptPrompt());
  const [globalScriptPrompt, setGlobalScriptPrompt] =
    useState<ScriptPromptOptions>(emptyScriptPrompt());
  const [scriptPromptReady, setScriptPromptReady] = useState(false);

  const scriptPromptModeRef = useRef<ScriptPromptMode>('global');
  const scriptPromptRef = useRef<ScriptPromptOptions>(emptyScriptPrompt());

  useEffect(() => {
    let cancelled = false;
    void loadGlobalScriptPrompt().then((g) => {
      if (cancelled) return;
      setGlobalScriptPrompt(g);
      setScriptPromptReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateTts = useCallback((next: TtsOptions) => {
    ttsRef.current = next;
    setTts(next);
  }, []);

  const updatePublished = useCallback((next: boolean) => {
    publishedRef.current = next;
    setPublished(next);
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
      const currentTts = ttsRef.current;
      const currentPublished = publishedRef.current;
      const currentPromptMode = scriptPromptModeRef.current;
      const currentPrompt = scriptPromptRef.current;

      setError(null);
      setFileName(file.name);
      setFileSize(file.size);
      setUploading(true);
      setProgress(0);
      try {
        const job = await createJob(file, {
          tts: currentTts,
          published: currentPublished,
          scriptPromptMode: currentPromptMode,
          scriptPrompt:
            currentPromptMode === 'custom' ? currentPrompt : undefined,
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
      setError('请输入内容链接');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError('链接需以 http:// 或 https:// 开头');
      return;
    }

    const currentTts = ttsRef.current;
    const currentPublished = publishedRef.current;
    const currentPromptMode = scriptPromptModeRef.current;
    const currentPrompt = scriptPromptRef.current;

    setError(null);
    setFileName(url);
    setFileSize(null);
    setUploading(true);
    setProgress(12);
    try {
      const job = await createJobFromUrl(url, {
        tts: currentTts,
        published: currentPublished,
        scriptPromptMode: currentPromptMode,
        scriptPrompt:
          currentPromptMode === 'custom' ? currentPrompt : undefined,
      });
      setProgress(100);
      onCreated(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [onCreated, sourceUrl]);

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const ttsSummary = `${MODE_LABEL[tts.mode] || tts.mode}${
    tts.mode !== 'voicedesign' && tts.voice ? ` · ${tts.voice}` : ''
  }`;
  const promptSummary = summarizeScriptPrompt(
    scriptPromptMode === 'global' ? globalScriptPrompt : scriptPrompt,
  );

  return (
    <div className="upload-studio">
      {/* 1. 先配置 */}
      <aside className="upload-studio-side" aria-label="发布与音色配置">
        <div className="upload-settings-card">
          <div className="upload-settings-head">
            <div>
              <div className="upload-settings-kicker">配置</div>
              <h3 className="upload-settings-title">发布 · 人设 · 音色</h3>
            </div>
            <div className="upload-settings-icon">
              <IconSpark size={16} />
            </div>
          </div>

          <label className={['upload-switch-row', uploading ? 'is-locked' : ''].join(' ')}>
            <div className="upload-switch-copy">
              <div className="title">完成后自动发布</div>
              <div className="desc">
                {uploading
                  ? published
                    ? '任务完成后将发布到听播前台'
                    : '任务仅在后台处理，不会自动发布'
                  : '开启后，任务完成后会进入听播前台'}
              </div>
            </div>
            <span className={['upload-switch', published ? 'is-on' : ''].join(' ')}>
              <i />
              <input
                type="checkbox"
                className="upload-switch-input"
                checked={published}
                disabled={uploading}
                onChange={(e) => updatePublished(e.target.checked)}
                aria-label="完成后自动发布"
              />
            </span>
          </label>

          <div className="section-rule" />

          <div className="upload-tts-block">
            <div className="upload-tts-head">
              <div className="left">
                <IconMic size={14} />
                <span>TTS 模式</span>
              </div>
              <span className="current">
                {uploading ? '已锁定' : ttsSummary}
              </span>
            </div>
            {uploading ? (
              <TtsSummary value={tts} />
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <TtsModePicker value={tts} onChange={updateTts} />
              </div>
            )}
          </div>

          <div className="section-rule" />

          <div className="upload-script-prompt-block">
            <div className="upload-tts-head">
              <div className="left">
                <IconSpark size={14} />
                <span>口播人设</span>
              </div>
              <span className="current">
                {uploading
                  ? '已锁定'
                  : scriptPromptMode === 'global'
                    ? `全局 · ${promptSummary}`
                    : `单独 · ${promptSummary}`}
              </span>
            </div>
            <ScriptPromptPicker
              mode={scriptPromptMode}
              value={scriptPrompt}
              globalValue={globalScriptPrompt}
              disabled={uploading || !scriptPromptReady}
              onModeChange={updateScriptPromptMode}
              onChange={updateScriptPrompt}
              onGlobalChange={setGlobalScriptPrompt}
            />
          </div>
        </div>
      </aside>

      {/* 2. 提示 */}
      <div className="upload-tips-card" aria-label="小提示">
        <div className="upload-tips-title">小提示</div>
        <ul className="upload-tips-row">
          <li>提交前可配置口播人设（全局默认或本次单独），再确认音色与发布策略</li>
          <li>本地与 URL 均支持视频 / 音频 / 文本，自动识别并分流</li>
          <li>文本会跳过转写，直接生成口播稿并 TTS</li>
          <li>URL 请使用可直接访问的资源链接（非需登录页）</li>
        </ul>
      </div>

      {/* 3. 素材入口：本地 / URL */}
      <div className="upload-studio-main">
        <div className="upload-source-tabs" role="tablist" aria-label="导入方式">
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
            本地文件
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
            URL 导入
          </button>
        </div>

        {sourceMode === 'file' ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="选择或拖拽视频 / 音频 / 文本上传"
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
                <IconUpload size={26} />
              </div>

              <div className="upload-dropzone-copy">
                <h2>
                  {uploading ? '正在上传…' : '配置完成后，拖拽文件到此处'}
                </h2>
                <p>上传即开始处理 · 支持视频 / 音频 / 文本</p>
              </div>

              <div className="upload-dropzone-badges">
                <span className="upload-badge">最大 500MB</span>
                <span className="upload-badge">视频 / 音频 / 文本</span>
                <span className="upload-badge">自动识别分流</span>
                <span className="upload-badge">
                  {published ? '完成后发布' : '仅后台处理'}
                </span>
                {tts.mode !== 'voicedesign' && tts.voice ? (
                  <span className="upload-badge">{tts.voice}</span>
                ) : null}
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
                  选择文件并开始
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
            <div className="upload-url-head">
              <div className="upload-dropzone-icon is-sm">
                <IconVideo size={20} />
              </div>
              <div>
                <h2>从 URL 导入内容</h2>
                <p>自动识别视频 · 音频 · 文本，并进入对应处理流程</p>
              </div>
            </div>

            <label className="upload-url-field">
              <span className="label">内容链接</span>
              <input
                type="url"
                className="nl-input"
                placeholder="https://example.com/article.html 或 media.mp3 / video.mp4"
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

            <div className="upload-dropzone-badges">
              <span className="upload-badge">视频 → 抽音频 → 转写</span>
              <span className="upload-badge">音频 → 转写</span>
              <span className="upload-badge">文本 → 跳过转写</span>
              <span className="upload-badge">
                {published ? '完成后发布' : '仅后台处理'}
              </span>
            </div>

            <button
              type="button"
              className="nl-btn nl-btn-primary upload-dropzone-cta"
              disabled={uploading || !sourceUrl.trim()}
              onClick={() => void handleUrl()}
            >
              <IconUpload size={15} />
              {uploading ? '正在提交…' : '识别并开始处理'}
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
                <div className="upload-file-name">{fileName}</div>
                <div className="upload-file-sub">
                  {fileSize != null ? formatSize(fileSize) : sourceMode === 'url' ? 'URL 导入' : '—'}
                  <span className="dot">·</span>
                  {ttsSummary}
                  <span className="dot">·</span>
                  {promptSummary}
                  <span className="dot">·</span>
                  {published ? '完成后发布' : '暂不发布'}
                </div>
              </div>
              <div className="upload-file-status">
                {uploading ? (
                  <span className="pct">{progress}%</span>
                ) : (
                  <span className="done">
                    <IconCheck size={14} />
                    已提交
                  </span>
                )}
              </div>
            </div>
            <ProgressBar value={uploading ? progress : 100} />
            <div className="upload-progress-hint">
              {uploading
                ? sourceMode === 'url'
                  ? '任务已创建，服务端将下载并识别内容类型…'
                  : '上传完成后将自动跳转到任务详情，查看转写与合成进度。'
                : '任务已创建，正在跳转…'}
            </div>
          </div>
        )}

        {error && (
          <div className="upload-error" role="alert">
            <div className="upload-error-title">
              {sourceMode === 'url' ? '导入失败' : '上传失败'}
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
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
