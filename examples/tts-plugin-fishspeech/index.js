/**
 * BokeBox TTS 插件：Fish Speech / Fish Audio
 *
 * 兼容：
 * - Fish Audio 云端：https://api.fish.audio  + API Key + model header
 * - 自托管 Fish Speech / OpenAudio：http://host:8080  POST /v1/tts
 *
 * 安装：
 *   mkdir -p storage/plugins/tts
 *   cp -R examples/tts-plugin-fishspeech storage/plugins/tts/fishspeech
 *   curl -X POST http://localhost:8787/api/tts-plugins/rescan
 *
 * 设置页填写 baseUrl / apiKey / referenceId，启用后将 ttsProvider 设为 tts.fishspeech。
 *
 * 文档：
 * - https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 * - https://github.com/fishaudio/fish-speech
 *
 * 仓库：https://github.com/vastsa/BokeBox
 * 协议：LGPL-3.0
 */

const PLUGIN_ID = 'tts.fishspeech';
const DEFAULT_BASE_URL = 'https://api.fish.audio';
const DEFAULT_MODEL = 's2.1-pro-free';
const DEFAULT_FORMAT = 'wav';
const DEFAULT_LATENCY = 'normal';
const DEFAULT_TEMPERATURE = 0.8;
const DEFAULT_TOP_P = 0.8;
const DEFAULT_CHUNK_LENGTH = 200;
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 600_000;

/** 宿主其它内置提供方的预置音色，不可当作 Fish reference_id */
const FOREIGN_VOICE_IDS = new Set([
  'mimo_default',
  '冰糖',
  '茉莉',
  '苏打',
  '白桦',
  'Mia',
  'Chloe',
  'Milo',
  'Dean',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-XiaochenNeural',
  'zh-CN-XiaohanNeural',
  'zh-CN-XiaomengNeural',
  'zh-CN-XiaomoNeural',
  'zh-CN-XiaoruiNeural',
  'zh-CN-XiaoshuangNeural',
  'zh-CN-XiaoxuanNeural',
  'zh-CN-YunfengNeural',
  'zh-CN-YunhaoNeural',
  'zh-CN-YunxiaNeural',
  'zh-CN-YunyeNeural',
  'zh-CN-YunzeNeural',
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-GB-SoniaNeural',
]);

function cfg(ctx, key, fallback) {
  const v = ctx?.getConfig?.(key) ?? ctx?.config?.[key];
  return v === undefined || v === null || v === '' ? fallback : v;
}

function asString(raw, fallback = '') {
  if (raw === undefined || raw === null) return fallback;
  return String(raw).trim();
}

function asBoolean(raw, fallback = true) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
  }
  if (typeof raw === 'number') return raw !== 0;
  return fallback;
}

function asNumber(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (typeof min === 'number') out = Math.max(min, out);
  if (typeof max === 'number') out = Math.min(max, out);
  return out;
}

function normalizeBaseUrl(raw) {
  const s = asString(raw, DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (!s) return DEFAULT_BASE_URL;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`无效的 baseUrl: ${s}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('baseUrl 仅支持 http/https');
  }
  // 允许用户误填 .../v1 或 .../v1/tts
  let path = u.pathname.replace(/\/+$/, '');
  if (path.endsWith('/v1/tts')) path = path.slice(0, -'/v1/tts'.length);
  if (path.endsWith('/v1')) path = path.slice(0, -'/v1'.length);
  u.pathname = path || '/';
  // URL with pathname "/" → origin only
  const out = path && path !== '/' ? `${u.origin}${path}` : u.origin;
  return out.replace(/\/+$/, '');
}

function isFishAudioCloud(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'api.fish.audio' || host === 'fish.audio' || host.endsWith('.fish.audio');
  } catch {
    return false;
  }
}

function isForeignVoice(voice) {
  if (!voice) return true;
  if (FOREIGN_VOICE_IDS.has(voice)) return true;
  if (/^zh-CN-/i.test(voice) || /^en-[A-Z]{2}-/i.test(voice)) return true;
  return false;
}

/**
 * 解析 reference_id：
 * 1. 任务音色（非其它提供方预置名）
 * 2. 插件配置 referenceId
 */
function resolveReferenceId(input, ctx) {
  const fromConfig = asString(cfg(ctx, 'referenceId', ''));
  const fromVoice = asString(input?.tts?.voice || '');
  if (fromVoice && !isForeignVoice(fromVoice)) return fromVoice;
  return fromConfig || undefined;
}

function cleanText(raw) {
  // 去掉可能残留的 MiMo 风格前导括号标签，避免被念出来
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^[\[\(（]\s*[^\]\)）]+?\s*[\]\)）]\s*/, '')
    .trim();
}

function detectFormat(buf, fallback = 'wav') {
  if (!buf || buf.length < 4) return fallback;
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav';
  if (buf.slice(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';
  return fallback;
}

async function readErrorBody(res) {
  try {
    const text = await res.text();
    if (!text) return res.statusText || String(res.status);
    try {
      const json = JSON.parse(text);
      if (typeof json?.message === 'string') return json.message;
      if (typeof json?.error === 'string') return json.error;
      if (typeof json?.detail === 'string') return json.detail;
      return text.slice(0, 800);
    } catch {
      return text.slice(0, 800);
    }
  } catch {
    return res.statusText || String(res.status);
  }
}

const plugin = {
  id: PLUGIN_ID,
  name: 'Fish Speech',
  description:
    'Fish Audio / 自托管 Fish Speech TTS。支持 reference_id 音色与多模型 header。',
  version: '0.1.0',
  riskLevel: 'medium',
  defaultEnabled: false,
  meta: {
    id: PLUGIN_ID,
    name: 'Fish Speech',
    description:
      'Fish Audio 云端或自托管 Fish Speech。音色使用 reference_id（克隆/音色库模型 id）。',
    modes: [
      {
        id: 'default',
        label: '参考音色合成',
        modelHint: 's2.1-pro / s2-pro / s1',
        description: '文本 → 语音；音色由 reference_id 决定',
      },
    ],
    // 克隆音色无固定预置列表；UI 走 reference 面板
    voices: [],
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    voiceUi: 'reference',
    voiceConfigKey: 'referenceId',
    maxCharsPerRequest: 800,
    suggestedModels: {
      tts: DEFAULT_MODEL,
      defaultVoice: '',
    },
  },
  isAvailable(ctx) {
    try {
      // 热加载后宿主 isAvailable() 通常无参；此时只检查是否有基本配置能力
      // 真正合成前会再校验
      if (!ctx) return true;
      const baseUrl = normalizeBaseUrl(cfg(ctx, 'baseUrl', DEFAULT_BASE_URL));
      const apiKey = asString(cfg(ctx, 'apiKey', ''));
      if (!baseUrl) return false;
      if (isFishAudioCloud(baseUrl) && !apiKey) return false;
      return true;
    } catch {
      return false;
    }
  },
  async synthesizeChunk(input, ctx) {
    const baseUrl = normalizeBaseUrl(cfg(ctx, 'baseUrl', DEFAULT_BASE_URL));
    const apiKey = asString(cfg(ctx, 'apiKey', ''));
    const model = asString(cfg(ctx, 'model', DEFAULT_MODEL)) || DEFAULT_MODEL;
    const formatRaw = asString(cfg(ctx, 'format', DEFAULT_FORMAT)).toLowerCase();
    const format = ['wav', 'mp3', 'opus', 'pcm'].includes(formatRaw)
      ? formatRaw
      : DEFAULT_FORMAT;
    const latencyRaw = asString(cfg(ctx, 'latency', DEFAULT_LATENCY)).toLowerCase();
    const latency = ['normal', 'balanced', 'low'].includes(latencyRaw)
      ? latencyRaw
      : DEFAULT_LATENCY;
    const temperature = asNumber(
      cfg(ctx, 'temperature', DEFAULT_TEMPERATURE),
      DEFAULT_TEMPERATURE,
      0.1,
      1,
    );
    const topP = asNumber(cfg(ctx, 'topP', DEFAULT_TOP_P), DEFAULT_TOP_P, 0.1, 1);
    const chunkLength = Math.floor(
      asNumber(
        cfg(ctx, 'chunkLength', DEFAULT_CHUNK_LENGTH),
        DEFAULT_CHUNK_LENGTH,
        100,
        300,
      ),
    );
    const normalize = asBoolean(cfg(ctx, 'normalize', true), true);
    const timeoutMs = Math.floor(
      asNumber(
        cfg(ctx, 'timeoutMs', DEFAULT_TIMEOUT_MS),
        DEFAULT_TIMEOUT_MS,
        MIN_TIMEOUT_MS,
        MAX_TIMEOUT_MS,
      ),
    );

    if (isFishAudioCloud(baseUrl) && !apiKey) {
      throw new Error(
        'Fish Audio 云端需要 API Key：请在「插件 → Fish Speech」填写 apiKey',
      );
    }

    const text = cleanText(input?.text);
    if (!text) throw new Error('Fish Speech TTS 文本为空');

    const referenceId = resolveReferenceId(input, ctx);
    // voice 字段「config」仅表示走插件配置，不作为 reference_id 发送
    const effectiveRef =
      referenceId && referenceId !== 'config' ? referenceId : undefined;

    const body = {
      text,
      format,
      latency,
      temperature,
      top_p: topP,
      chunk_length: chunkLength,
      normalize,
      streaming: false,
    };
    if (effectiveRef) body.reference_id = effectiveRef;

    const url = `${baseUrl}/v1/tts`;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'audio/*, application/octet-stream, */*',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    // 云端要求 model header；自托管忽略无妨
    if (model) headers.model = model;

    const controller = new AbortController();
    const parentSignal = ctx?.signal;
    const onAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`Fish Speech TTS 超时（>${timeoutMs}ms）`);
      }
      throw new Error(
        `Fish Speech TTS 请求失败: ${err?.message || String(err)}`,
      );
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', onAbort);
    }

    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw new Error(
        `Fish Speech TTS 合成失败 (${res.status}): ${detail}`,
      );
    }

    const ab = await res.arrayBuffer();
    const audio = Buffer.from(ab);
    if (!audio.length) throw new Error('Fish Speech TTS 返回音频为空');

    const detected = detectFormat(audio, format === 'opus' ? 'ogg' : format);
    const outFormat =
      detected === 'ogg' ? 'ogg' : detected === 'mp3' ? 'mp3' : detected === 'wav' ? 'wav' : 'unknown';

    return {
      audio,
      format: outFormat,
      provider: PLUGIN_ID,
      model: isFishAudioCloud(baseUrl) ? model : 'server-default',
      voice: effectiveRef || 'default',
      mode: 'default',
      demo: false,
    };
  },
};

export default plugin;
