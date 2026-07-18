import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import {
  createJob,
  deleteJob,
  getJob,
  listJobs,
  listPublishedJobs,
  toPublic,
  updateJob,
  withScriptTiming,
} from '../job/jobStore.js';
import { removeJobFromAllAlbums } from '../album/albumStore.js';
import {
  assertPipelinePrereqs,
  buildRetryPatch,
  isPipelineFromStep,
  resolveDefaultFromStep,
  runPipeline,
} from '../job/pipeline.js';
import {
  getGlobalScriptPrompt,
  getGlobalTtsOptions,
  normalizeTtsOptions,
  getContentLocale,
} from '../settings/index.js';
import { normalizeScriptPrompt } from '../content/scriptPrompt.js';
import { isValidHttpUrl } from '../import/index.js';
import {
  ensureBuiltinSourcePlugins,
  getSourcePluginRegistration,
  isSourcePluginEnabled,
  refreshExternalSourcePlugins,
} from '../../sources/index.js';
import { jobPaths } from '../../utils/paths.js';
import { ensureDir, removeDirIfExists } from '../../utils/fs.js';
import { deleteListenRecord } from '../job/listenStore.js';
import {
  getAsrModel,
  getAsrProviderId,
  getBaseUrl,
  getChatModel,
  getDefaultTtsVoice,
  getImageModel,
  getTtsModel,
  getTtsProviderId,
  getVoiceDesignModel,
  hasApiKey,
} from '../../utils/aiConfig.js';
import type {
  Job,
  JobPublic,
  PipelineFromStep,
  ScriptPromptOptions,
  TtsOptions,
} from '../../types/job.js';
import { isContentLocale, type Locale } from '../../i18n/index.js';

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};

function okJson(data: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errText(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function summarizeJob(job: Job | JobPublic) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    progress: job.progress,
    message: job.message,
    published: job.published !== false,
    sourceKind: job.sourceKind,
    sourceUrl: 'sourceUrl' in job ? job.sourceUrl : undefined,
    hasPodcast: Boolean(job.podcast),
    hasCoverImage: Boolean(job.podcast?.hasCoverImage),
    hasTranscript: Boolean(
      ('hasTranscript' in job && job.hasTranscript) || job.transcript?.trim(),
    ),
    locale: job.locale,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
    podcastTitle: job.podcast?.title,
    podcastSummary: job.podcast?.summary,
    tags: job.podcast?.tags,
    estimatedMinutes: job.podcast?.estimatedMinutes,
  };
}

function resolveLocale(raw?: unknown): Locale {
  if (isContentLocale(raw)) return raw;
  return getContentLocale();
}

function resolveTts(custom?: Partial<TtsOptions> | null): TtsOptions {
  if (custom && Object.keys(custom).length > 0) {
    return normalizeTtsOptions({ ...getGlobalTtsOptions(), ...custom });
  }
  return normalizeTtsOptions(getGlobalTtsOptions());
}

function resolveScriptPrompt(
  custom?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions | undefined {
  if (custom && Object.keys(custom).length > 0) {
    return normalizeScriptPrompt(custom) || undefined;
  }
  return normalizeScriptPrompt(getGlobalScriptPrompt()) || undefined;
}

/** MCP 工具清单 */
export function listMcpTools(): McpToolDefinition[] {
  return [
    {
      name: 'list_jobs',
      description:
        '列出 BokeBox 播客制作任务。可按 status 过滤：queued/extracting_audio/transcribing/generating_podcast/generating_cover/synthesizing_audio/done/failed。',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: '可选状态过滤',
          },
          limit: {
            type: 'number',
            description: '返回条数，默认 30，最大 100',
          },
        },
      },
    },
    {
      name: 'get_job',
      description: '获取单个任务详情（含脚本摘要、闪卡、笔记等）。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 ID' },
          includeScript: {
            type: 'boolean',
            description: '是否包含完整口播脚本，默认 false',
          },
          includeTranscript: {
            type: 'boolean',
            description: '是否包含转写全文，默认 false',
          },
          includeShowNotes: {
            type: 'boolean',
            description: '是否包含节目笔记，默认 true',
          },
          includeFlashcards: {
            type: 'boolean',
            description: '是否包含知识闪卡，默认 true',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_podcast_from_url',
      description:
        '从网页/视频/音频 URL 创建播客任务并自动入队处理（转写→口播稿→TTS→封面/闪卡）。',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http(s) 资源地址（指定插件时也可为插件可处理的其它 scheme）' },
          pluginId: {
            type: 'string',
            description: '可选：指定 Source 插件 id；缺省自动匹配',
          },
          title: { type: 'string', description: '可选标题' },
          published: {
            type: 'boolean',
            description: '完成后是否上架到听播库，默认 true',
          },
          locale: {
            type: 'string',
            description: '内容语言，如 zh-CN / en-US',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'create_podcast_from_text',
      description:
        '从纯文本/文稿直接创建播客任务（跳过 ASR），自动生成口播稿与音频。',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '文稿正文，至少约 20 字' },
          title: { type: 'string', description: '可选标题' },
          published: {
            type: 'boolean',
            description: '完成后是否上架，默认 true',
          },
          locale: {
            type: 'string',
            description: '内容语言，如 zh-CN / en-US',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'update_job',
      description: '更新任务标题或上架状态。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          published: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'retry_job',
      description:
        '重跑任务流水线。fromStep 可选：extract/transcribe/script/cover/flashcards/synthesize。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fromStep: {
            type: 'string',
            description:
              '流水线起点：extract | transcribe | script | cover | flashcards | synthesize',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_job',
      description: '删除任务及其媒体文件。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_library',
      description: '列出听播库中已完成且已上架的播客。',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '返回条数，默认 30，最大 100',
          },
        },
      },
    },
    {
      name: 'get_system_health',
      description: '查看 BokeBox 系统状态、AI 模型配置与 demo 模式。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResult> {
  try {
    switch (name) {
      case 'list_jobs':
        return await toolListJobs(args);
      case 'get_job':
        return await toolGetJob(args);
      case 'create_podcast_from_url':
        return await toolCreateFromUrl(args);
      case 'create_podcast_from_text':
        return await toolCreateFromText(args);
      case 'update_job':
        return await toolUpdateJob(args);
      case 'retry_job':
        return await toolRetryJob(args);
      case 'delete_job':
        return await toolDeleteJob(args);
      case 'list_library':
        return await toolListLibrary(args);
      case 'get_system_health':
        return toolHealth();
      default:
        return errText(`未知工具: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errText(message);
  }
}

async function toolListJobs(args: Record<string, unknown>) {
  const status = String(args.status || '').trim();
  const limit = Math.min(100, Math.max(1, Number(args.limit) || 30));
  let jobs = await listJobs();
  if (status) {
    jobs = jobs.filter((j) => j.status === status);
  }
  const items = jobs.slice(0, limit).map(summarizeJob);
  return okJson({ total: jobs.length, returned: items.length, jobs: items });
}

async function toolGetJob(args: Record<string, unknown>) {
  const id = String(args.id || '').trim();
  if (!id) return errText('缺少参数 id');
  const job = await getJob(id);
  if (!job) return errText(`任务不存在: ${id}`);
  const enriched = await withScriptTiming(job);
  const includeScript = Boolean(args.includeScript);
  const includeTranscript = Boolean(args.includeTranscript);
  const includeShowNotes = args.includeShowNotes !== false;
  const includeFlashcards = args.includeFlashcards !== false;

  const publicJob = toPublic(enriched);
  const detail: Record<string, unknown> = {
    ...summarizeJob(publicJob),
    hostIntro: publicJob.podcast?.hostIntro,
    outline: publicJob.podcast?.outline,
    tts: publicJob.tts,
    scriptPrompt: publicJob.scriptPrompt,
  };
  if (includeShowNotes) detail.showNotes = publicJob.podcast?.showNotes;
  if (includeFlashcards) detail.flashcards = publicJob.podcast?.flashcards;
  if (includeScript) detail.script = publicJob.podcast?.script;
  if (includeTranscript) detail.transcript = publicJob.transcript;
  return okJson({ job: detail });
}

async function toolCreateFromUrl(args: Record<string, unknown>) {
  const url = String(args.url || '').trim();
  if (!url) return errText('缺少参数 url');

  const pluginId = String(args.pluginId || '').trim() || undefined;
  ensureBuiltinSourcePlugins();
  if (pluginId) {
    let reg = getSourcePluginRegistration(pluginId);
    if (!reg) {
      await refreshExternalSourcePlugins();
      reg = getSourcePluginRegistration(pluginId);
    }
    if (!reg) return errText(`Source 插件不存在: ${pluginId}`);
    if (!reg.plugin || reg.loadError) {
      return errText(
        `Source 插件不可用: ${pluginId}${reg.loadError ? ` (${reg.loadError})` : ''}`,
      );
    }
    if (!isSourcePluginEnabled(pluginId)) {
      return errText(`Source 插件未启用: ${pluginId}`);
    }
    if (!reg.plugin.isAvailable()) {
      return errText(`Source 插件不可用: ${pluginId}`);
    }
    if (
      !reg.plugin.canHandle({
        type: 'url',
        url,
        jobId: 'validate',
        pluginId,
      })
    ) {
      return errText(`所选 Source 插件无法处理该链接: ${pluginId}`);
    }
  } else if (!isValidHttpUrl(url)) {
    return errText('url 不是有效的 http(s) 地址');
  }

  const tts = resolveTts();
  const scriptPrompt = resolveScriptPrompt();
  const published =
    args.published === undefined ? true : Boolean(args.published);
  const id = nanoid(12);
  const now = new Date().toISOString();
  let titleHint = String(args.title || '').trim();
  if (!titleHint) {
    try {
      titleHint = new URL(url).hostname;
    } catch {
      titleHint = 'URL 导入';
    }
  }

  const job: Job = {
    id,
    title: titleHint,
    originalFilename: url,
    mimeType: 'application/octet-stream',
    size: 0,
    status: 'queued',
    progress: 3,
    message: `URL 入队 · ${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}`,
    locale: resolveLocale(args.locale),
    videoPath: '',
    sourceUrl: url,
    sourcePluginId: pluginId,
    sourceKind: 'video',
    tts,
    scriptPrompt,
    published,
    createdAt: now,
    updatedAt: now,
  };

  await createJob(job);
  void runPipeline(id);
  return okJson({
    ok: true,
    message: '已从 URL 创建任务并开始处理',
    job: summarizeJob(toPublic(job)),
  });
}

async function toolCreateFromText(args: Record<string, unknown>) {
  const text = String(args.text || '').trim();
  if (!text || text.length < 20) {
    return errText('text 过短，请提供至少约 20 字的正文');
  }

  const tts = resolveTts();
  const scriptPrompt = resolveScriptPrompt();
  const published =
    args.published === undefined ? true : Boolean(args.published);
  const id = nanoid(12);
  const now = new Date().toISOString();
  const title =
    String(args.title || '').trim() ||
    text.slice(0, 40).replace(/\s+/g, ' ') ||
    '文稿播客';

  const paths = jobPaths(id);
  await ensureDir(paths.dir);
  const sourcePath = paths.source('.txt');
  await fs.writeFile(sourcePath, text, 'utf8');
  await fs.writeFile(paths.transcript, text, 'utf8');

  const job: Job = {
    id,
    title,
    originalFilename: `${title}.txt`,
    mimeType: 'text/plain',
    size: Buffer.byteLength(text, 'utf8'),
    status: 'queued',
    progress: 5,
    message: `文稿入队 · ${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}`,
    locale: resolveLocale(args.locale),
    videoPath: sourcePath,
    sourceKind: 'text',
    transcript: text,
    tts,
    scriptPrompt,
    published,
    createdAt: now,
    updatedAt: now,
  };

  await createJob(job);
  void runPipeline(id);
  return okJson({
    ok: true,
    message: '已从文稿创建任务并开始处理',
    job: summarizeJob(toPublic(job)),
  });
}

async function toolUpdateJob(args: Record<string, unknown>) {
  const id = String(args.id || '').trim();
  if (!id) return errText('缺少参数 id');
  const job = await getJob(id);
  if (!job) return errText(`任务不存在: ${id}`);

  const patch: Partial<Job> = {};
  if (typeof args.title === 'string' && args.title.trim()) {
    patch.title = args.title.trim();
  }
  if (typeof args.published === 'boolean') {
    patch.published = args.published;
  }
  if (Object.keys(patch).length === 0) {
    return errText('没有可更新字段（title / published）');
  }
  const updated = await updateJob(id, patch);
  return okJson({
    ok: true,
    job: updated ? summarizeJob(toPublic(updated)) : null,
  });
}

async function toolRetryJob(args: Record<string, unknown>) {
  const id = String(args.id || '').trim();
  if (!id) return errText('缺少参数 id');
  const job = await getJob(id);
  if (!job) return errText(`任务不存在: ${id}`);
  if (job.status !== 'failed' && job.status !== 'done') {
    return errText('仅 failed / done 状态的任务可重跑');
  }

  const fromStep: PipelineFromStep = isPipelineFromStep(args.fromStep)
    ? (args.fromStep as PipelineFromStep)
    : await resolveDefaultFromStep(job);

  await assertPipelinePrereqs(job, fromStep);
  const tts = normalizeTtsOptions(job.tts);
  await updateJob(job.id, {
    ...buildRetryPatch(
      job,
      fromStep,
      tts,
      job.scriptPrompt,
      resolveLocale(job.locale),
    ),
  });
  void runPipeline(job.id, { fromStep });
  const latest = await getJob(job.id);
  return okJson({
    ok: true,
    message: `已从 ${fromStep} 开始重跑`,
    job: latest ? summarizeJob(toPublic(latest)) : null,
  });
}

async function toolDeleteJob(args: Record<string, unknown>) {
  const id = String(args.id || '').trim();
  if (!id) return errText('缺少参数 id');
  const prev = await deleteJob(id);
  if (!prev) return errText(`任务不存在: ${id}`);
  removeJobFromAllAlbums(id);
  await deleteListenRecord(id);
  await removeDirIfExists(jobPaths(id).dir);
  return okJson({ ok: true, deletedId: id, title: prev.title });
}

async function toolListLibrary(args: Record<string, unknown>) {
  const limit = Math.min(100, Math.max(1, Number(args.limit) || 30));
  const jobs = await listPublishedJobs();
  const items = [];
  for (const job of jobs.slice(0, limit)) {
    const enriched = await withScriptTiming(job);
    items.push(summarizeJob(toPublic(enriched)));
  }
  return okJson({
    total: jobs.length,
    returned: items.length,
    items,
  });
}

function toolHealth() {
  return okJson({
    ok: true,
    demoMode: !hasApiKey(),
    baseUrl: getBaseUrl(),
    models: {
      chat: getChatModel(),
      asr: getAsrModel(),
      tts: getTtsModel(),
      voiceDesign: getVoiceDesignModel(),
      image: getImageModel() || undefined,
    },
    providers: {
      asr: getAsrProviderId(),
      tts: getTtsProviderId(),
    },
    defaultVoice: getDefaultTtsVoice(),
    contentLocale: getContentLocale(),
    time: new Date().toISOString(),
    openSource: 'https://github.com/vastsa/BokeBox/',
    license: 'LGPL-3.0-only',
  });
}
