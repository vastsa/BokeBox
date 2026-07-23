import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isAudioControlTag } from '@bokebox/shared';
import {
  getDefaultTtsVoice,
  getTtsModel,
  getVoiceDesignModel,
} from '../../utils/aiConfig.js';
import type { TtsMode, TtsOptions } from '../../types/job.js';
import {
  isCloudEndpointReady,
  pluginFetch,
  resolveCloudEndpoint,
} from '../pluginEndpoint.js';
import type {
  TtsChunkInput,
  TtsChunkResult,
  TtsPluginContext,
  TtsProvider,
} from './types.js';

/**
 * mimo-v2.5-tts 预置精品音色
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 */
export const MIMO_PRESET_VOICES = [
  {
    id: 'mimo_default',
    name: 'MiMo-默认',
    language: '自适应',
    gender: '-',
    description: '中国集群默认冰糖，其他集群默认 Mia',
  },
  { id: '冰糖', name: '冰糖', language: '中文', gender: '女性' },
  { id: '茉莉', name: '茉莉', language: '中文', gender: '女性' },
  { id: '苏打', name: '苏打', language: '中文', gender: '男性' },
  { id: '白桦', name: '白桦', language: '中文', gender: '男性' },
  { id: 'Mia', name: 'Mia', language: '英文', gender: '女性' },
  { id: 'Chloe', name: 'Chloe', language: '英文', gender: '女性' },
  { id: 'Milo', name: 'Milo', language: '英文', gender: '男性' },
  { id: 'Dean', name: 'Dean', language: '英文', gender: '男性' },
] as const;

const PRESET_VOICE_IDS = new Set(MIMO_PRESET_VOICES.map((v) => v.id));

export const MIMO_SPEECH_STYLE_TAGS = [
  '磁性',
  '沉稳',
  '温柔',
  '慵懒',
  '怅然',
  '深情',
  '欢快',
  '激昂',
  '清亮',
  '甜美',
  '东北话',
  '粤语',
] as const;

export const MIMO_AUDIO_TAG_EXAMPLES = [
  '吸气',
  '深呼吸',
  '叹气',
  '长叹一口气',
  '喘息',
  '屏息',
  '语速加快',
  '沉默片刻',
  '紧张',
  '激动',
  '疲惫',
  '委屈',
  '震惊',
  '不耐烦',
  '小声',
  '提高音量',
  '气声',
  '沙哑',
  '颤抖',
  '轻笑',
  '笑',
  '苦笑',
  '哽咽',
] as const;

const DEFAULT_TTS_MODEL = 'mimo-v2.5-tts';
const DEFAULT_VOICEDESIGN_MODEL = 'mimo-v2.5-tts-voicedesign';
const DEFAULT_VOICECLONE_MODEL = 'mimo-v2.5-tts-voiceclone';
/** 参考音频体积上限（避免把超大文件塞进 base64） */
const MAX_CLONE_AUDIO_BYTES = 8 * 1024 * 1024;

/** 多段口播会多次 synthesizeChunk：缓存已编码的 data URI */
const cloneDataUriCache = new Map<string, string>();
const CLONE_CACHE_MAX = 8;

function cacheCloneDataUri(key: string, uri: string): string {
  if (cloneDataUriCache.has(key)) cloneDataUriCache.delete(key);
  cloneDataUriCache.set(key, uri);
  while (cloneDataUriCache.size > CLONE_CACHE_MAX) {
    const first = cloneDataUriCache.keys().next().value;
    if (first === undefined) break;
    cloneDataUriCache.delete(first);
  }
  return uri;
}

function sniffAudioMime(buf: Buffer, fallback = 'audio/mpeg'): string {
  if (!buf || buf.length < 12) return fallback;
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') {
    return 'audio/wav';
  }
  if (buf.slice(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buf.slice(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
  // ftyp....M4A / mp4
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  return fallback;
}

export function resolveMimoPresetVoice(voice?: string): string {
  const candidate = voice?.trim() || getDefaultTtsVoice();
  if (PRESET_VOICE_IDS.has(candidate as (typeof MIMO_PRESET_VOICES)[number]['id'])) {
    return candidate;
  }
  return getDefaultTtsVoice();
}

function normalizeStyleTagList(tags?: string[] | string | null): string[] {
  if (!tags) return [];
  const raw = Array.isArray(tags) ? tags : String(tags).split(/[\s,，、|]+/);
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item || '').trim();
    if (!t) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/**
 * 解析并重建 assistant 文本开头的风格/语气标签。
 * 自然口播不强制任何默认标签；有配置时按句注入，不限首段。
 */
export function applyAssistantStyleTags(
  text: string,
  options?: {
    styleTags?: string[] | string;
    /** 默认 true：对本段注入 styleTags；显式 false 时跳过 */
    applyLeadingStyle?: boolean;
  },
): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return trimmed;

  const applyLeading = options?.applyLeadingStyle !== false;
  const requested = applyLeading ? normalizeStyleTagList(options?.styleTags) : [];

  const m = trimmed.match(/^[\[\(（]\s*([^\]\)）]+?)\s*[\]\)）]\s*([\s\S]*)$/);
  let existing: string[] = [];
  let body = trimmed;
  if (m && isAudioControlTag(m[1])) {
    existing = normalizeStyleTagList(m[1].split(/[\s,，、/|]+/));
    body = m[2].trim();
  }

  const tags = normalizeStyleTagList([...existing, ...requested]);
  if (!tags.length) return body || trimmed;
  return `(${tags.join(' ')})${body || trimmed}`;
}

/** 拒绝把 ASR 模型误用到 TTS 请求 */
function sanitizeMimoTtsModel(raw?: string): string {
  const model = (raw || '').trim();
  if (!model) return DEFAULT_TTS_MODEL;
  if (/-asr\b/i.test(model) || (/\basr\b/i.test(model) && !/\btts\b/i.test(model))) {
    return DEFAULT_TTS_MODEL;
  }
  return model;
}

function mimeFromAudioPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.ogg' || ext === '.oga') return 'audio/ogg';
  if (ext === '.webm') return 'audio/webm';
  if (ext === '.flac') return 'audio/flac';
  return 'audio/mpeg';
}

function isDataAudioUri(raw: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(raw);
}

/** 解析参考音频路径：绝对路径 / storage 相对路径 / 当前工作目录 */
export function resolveCloneAudioFilePath(
  raw: string,
  storageDir?: string,
): string {
  const s = String(raw || '').trim();
  if (!s || isDataAudioUri(s)) return s;
  if (path.isAbsolute(s)) return s;
  if (storageDir) {
    return path.resolve(storageDir, s.replace(/^\.?\//, ''));
  }
  return path.resolve(process.cwd(), s);
}

/**
 * 把路径或 data URI 规范成 API 需要的 data:audio/...;base64,...
 * 同一路径在多段合成中会命中内存缓存，避免重复读盘与编码。
 */
export async function toCloneVoiceDataUri(
  raw: string,
  storageDir?: string,
): Promise<string> {
  const s = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!s) {
    throw new Error('音色克隆缺少参考音频');
  }

  // 允许无 data: 前缀的纯 base64（少见，兼容手滑粘贴）
  let normalized = s;
  if (!isDataAudioUri(normalized) && /^[A-Za-z0-9+/=\s]+$/.test(normalized) && normalized.replace(/\s/g, '').length > 128) {
    normalized = `data:audio/mpeg;base64,${normalized.replace(/\s/g, '')}`;
  }

  if (isDataAudioUri(normalized)) {
    const cached = cloneDataUriCache.get(normalized.slice(0, 120));
    if (cached) return cached;
    const b64 = normalized.split(',')[1] || '';
    const approx = Math.floor((b64.length * 3) / 4);
    if (approx > MAX_CLONE_AUDIO_BYTES) {
      throw new Error(
        `参考音频过大（约 ${(approx / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_CLONE_AUDIO_BYTES / 1024 / 1024}MB）`,
      );
    }
    // 统一去掉空白
    const head = normalized.slice(0, normalized.indexOf(',') + 1);
    const compact = `${head}${b64.replace(/\s/g, '')}`;
    return cacheCloneDataUri(normalized.slice(0, 120), compact);
  }

  const filePath = resolveCloneAudioFilePath(s, storageDir);
  let st: { size: number; mtimeMs: number };
  try {
    const stat = await fs.stat(filePath);
    st = { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    throw new Error(
      `无法读取参考音频：${filePath}（可填 storage 相对路径，如 samples/clone.mp3，或 data URI）`,
    );
  }
  if (!st.size) throw new Error(`参考音频为空：${filePath}`);
  if (st.size > MAX_CLONE_AUDIO_BYTES) {
    throw new Error(
      `参考音频过大（${(st.size / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_CLONE_AUDIO_BYTES / 1024 / 1024}MB）`,
    );
  }

  const cacheKey = `${filePath}|${st.size}|${st.mtimeMs}`;
  const hit = cloneDataUriCache.get(cacheKey);
  if (hit) return hit;

  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    throw new Error(
      `无法读取参考音频：${filePath}（可填 storage 相对路径，如 samples/clone.mp3，或 data URI）`,
    );
  }
  const mime = sniffAudioMime(buf, mimeFromAudioPath(filePath));
  const uri = `data:${mime};base64,${buf.toString('base64')}`;
  return cacheCloneDataUri(cacheKey, uri);
}

export type MimoTtsRequestBody = {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  audio: { format: 'wav'; voice?: string };
  voice?: string;
  resolvedMode: TtsMode;
};

/**
 * 组装 MiMo chat/completions TTS 请求体（同步部分；克隆的 data URI 由调用方注入 voice）
 */
export function buildMimoTtsBody(
  text: string,
  tts?: TtsOptions,
  opts?: {
    applyLeadingStyle?: boolean;
    model?: string;
    voiceDesignModel?: string;
    voiceCloneModel?: string;
    /** voiceclone 已解析好的 data URI */
    cloneVoiceDataUri?: string;
    /** voiceclone 的 user 侧提示（参考音频对应文案，可空） */
    clonePrompt?: string;
  },
): MimoTtsRequestBody {
  const mode: TtsMode = tts?.mode || 'default';
  const cleanText = String(text || '').replace(/\r\n/g, '\n').trim();

  if (mode === 'voicedesign') {
    const design =
      tts?.voiceDesign?.trim() ||
      '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力';
    return {
      model:
        opts?.voiceDesignModel?.trim() ||
        getVoiceDesignModel() ||
        DEFAULT_VOICEDESIGN_MODEL,
      messages: [
        { role: 'user', content: design },
        { role: 'assistant', content: cleanText },
      ],
      audio: { format: 'wav' },
      voice: undefined,
      resolvedMode: 'voicedesign',
    };
  }

  if (mode === 'voiceclone') {
    const dataUri = String(opts?.cloneVoiceDataUri || '').trim();
    if (!dataUri) {
      throw new Error(
        '音色克隆需要参考音频：请在音色面板填写路径/data URI，或在插件配置 cloneAudioPath',
      );
    }
    const cloneModel = String(opts?.voiceCloneModel || '').trim() || DEFAULT_VOICECLONE_MODEL;
    return {
      model: cloneModel,
      messages: [
        // 官方示例：user 可为参考音频对应文案，允许空串
        { role: 'user', content: String(opts?.clonePrompt ?? '').trim() },
        { role: 'assistant', content: cleanText },
      ],
      audio: {
        format: 'wav',
        voice: dataUri,
      },
      voice: 'voiceclone',
      resolvedMode: 'voiceclone',
    };
  }

  const assistantText = applyAssistantStyleTags(cleanText, {
    styleTags: tts?.styleTags,
    applyLeadingStyle: opts?.applyLeadingStyle,
  });
  const voice = resolveMimoPresetVoice(tts?.voice);

  return {
    model: sanitizeMimoTtsModel(opts?.model),
    messages: [{ role: 'assistant', content: assistantText }],
    audio: {
      format: 'wav',
      voice,
    },
    voice,
    resolvedMode: 'default',
  };
}

/** 从任务 / 插件配置解析克隆参考来源字符串 */
export function pickCloneAudioSource(
  tts?: TtsOptions,
  ctx?: TtsPluginContext,
): string {
  const fromTask = String(tts?.voice || '').trim().replace(/^['"]|['"]$/g, '');
  // 任务级若是预置名，不当作参考音频
  if (
    fromTask &&
    !PRESET_VOICE_IDS.has(fromTask as never) &&
    fromTask !== 'voiceclone' &&
    fromTask !== 'clone-ref'
  ) {
    return fromTask;
  }
  const fromDataUri = String(ctx?.getConfig?.('cloneAudioDataUri') || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (fromDataUri) return fromDataUri;
  const fromPath = String(ctx?.getConfig?.('cloneAudioPath') || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return fromPath;
}

export const mimoTtsProvider: TtsProvider = {
  id: 'mimo',
  meta: {
    id: 'mimo',
    name: 'MiMo TTS',
    description:
      '小米 MiMo：预置音色 / VoiceDesign / 参考音频克隆（chat/completions）',
    modes: [
      {
        id: 'default',
        label: '自然口播',
        modelHint: DEFAULT_TTS_MODEL,
        description: '预置精品音色 · 音频标签控制',
      },
      {
        id: 'voicedesign',
        label: '自定义音色',
        modelHint: DEFAULT_VOICEDESIGN_MODEL,
        description: '文字描述定制音色（不支持预置音色/音频标签）',
      },
      {
        id: 'voiceclone',
        label: '音色克隆',
        modelHint: DEFAULT_VOICECLONE_MODEL,
        description: '上传/指定参考音频，克隆说话人音色',
      },
    ],
    voices: MIMO_PRESET_VOICES.map((v) => ({ ...v })),
    supportsStyleTags: true,
    supportsVoiceDesign: true,
    voiceUi: 'preset',
    maxCharsPerRequest: 500,
    suggestedModels: {
      tts: DEFAULT_TTS_MODEL,
      voiceDesign: DEFAULT_VOICEDESIGN_MODEL,
      defaultVoice: '冰糖',
    },
    // 自定义面板：三种模式分开展示
    voicePanel: {
      version: 1,
      title: 'MiMo 音色',
      description: '自然口播 / 文字设计 / 参考音频克隆',
      fields: [
        {
          type: 'modeTabs',
          options: [
            {
              id: 'default',
              label: '自然口播',
              description: '预置音色 + 风格标签',
            },
            {
              id: 'voicedesign',
              label: '自定义音色',
              description: '文字描述音色',
            },
            {
              id: 'voiceclone',
              label: '音色克隆',
              description: '参考音频克隆',
            },
          ],
        },
        {
          type: 'voiceGrid',
          when: { mode: 'default' },
        },
        {
          type: 'tags',
          bind: 'styleTags',
          label: '开头风格',
          optional: true,
          options: [...MIMO_SPEECH_STYLE_TAGS],
          when: { mode: 'default' },
        },
        {
          type: 'textarea',
          bind: 'voiceDesign',
          label: '音色描述',
          rows: 3,
          placeholder: '例如：温柔成熟的中文播客主持人，声线清晰，语速适中',
          description: 'Voice Design 不支持预置音色与风格标签',
          when: { mode: 'voicedesign' },
        },
        {
          type: 'info',
          text: '音色克隆：5–30 秒清晰人声（mp3/wav，≤8MB）。填 storage 相对路径如 samples/my-voice.mp3，或 data URI；也可在插件配置设置默认 cloneAudioPath。多段口播会自动复用同一次参考编码。',
          when: { mode: 'voiceclone' },
        },
        {
          type: 'text',
          bind: 'voice',
          label: '参考音频路径 / data URI',
          placeholder: 'samples/clone.mp3 或 data:audio/mpeg;base64,...',
          description:
            '留空则使用插件配置的 cloneAudioPath / cloneAudioDataUri。请勿把预置音色名填在这里。',
          when: { mode: 'voiceclone' },
        },
        { type: 'effectiveSummary' },
        {
          type: 'actions',
          items: ['usePluginDefault', 'clearOverride', 'openPluginSettings'],
        },
      ],
    },
  },
  isAvailable() {
    return isCloudEndpointReady('tts', 'mimo');
  },
  async synthesizeChunk(
    input: TtsChunkInput,
    ctx?: TtsPluginContext,
  ): Promise<TtsChunkResult> {
    const text = String(input.text || '').replace(/\r\n/g, '\n').trim();
    if (!text) throw new Error('MiMo TTS 文本为空');

    const ep = resolveCloudEndpoint('tts', 'mimo');
    const pluginModel = sanitizeMimoTtsModel(
      String(ctx?.getConfig?.('model') ?? '').trim() ||
        ep.model ||
        getTtsModel(),
    );
    const mode: TtsMode = input.tts?.mode || 'default';

    let cloneVoiceDataUri: string | undefined;
    const clonePrompt = String(ctx?.getConfig?.('clonePrompt') ?? '').trim();
    if (mode === 'voiceclone') {
      const source = pickCloneAudioSource(input.tts, ctx);
      if (!source) {
        throw new Error(
          '音色克隆未配置参考音频：请在音色面板填写路径/data URI，或在插件配置 cloneAudioPath',
        );
      }
      cloneVoiceDataUri = await toCloneVoiceDataUri(source, ctx?.storageDir);
    }

    const cloneModelCfg = String(ctx?.getConfig?.('cloneModel') ?? '').trim();
    const built = buildMimoTtsBody(text, input.tts, {
      applyLeadingStyle: input.applyLeadingStyle,
      model: sanitizeMimoTtsModel(input.model?.trim() || pluginModel),
      voiceDesignModel: input.voiceDesignModel,
      voiceCloneModel: cloneModelCfg || DEFAULT_VOICECLONE_MODEL,
      cloneVoiceDataUri,
      clonePrompt,
    });

    const requestModel = built.model;

    const res = await pluginFetch('tts', 'mimo', '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: requestModel,
        messages: built.messages,
        audio: built.audio,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const hint =
        built.resolvedMode === 'voiceclone'
          ? '（克隆模式请确认模型为 mimo-v2.5-tts-voiceclone，且参考音频清晰）'
          : '';
      throw new Error(
        `MiMo TTS 合成失败 (${res.status})${hint}: ${errText.slice(0, 800)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { audio?: { data?: string } } }>;
    };
    const b64 = data.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error('MiMo TTS 返回缺少 audio.data');

    return {
      audio: Buffer.from(b64, 'base64'),
      format: 'wav',
      provider: 'mimo',
      model: requestModel,
      voice:
        built.resolvedMode === 'voiceclone' ? 'voiceclone' : built.voice,
      mode: built.resolvedMode,
      demo: false,
    };
  },
};
