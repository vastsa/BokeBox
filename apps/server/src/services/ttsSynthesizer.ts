import fs from 'node:fs/promises';
import { jobPaths } from '../utils/paths.js';
import { copyFile, ensureDir, removeIfExists } from '../utils/fs.js';
import { convertToMp3 } from './audioExtractor.js';
import type { TtsMode, TtsOptions } from '../types/job.js';
import {
  aiFetch,
  getDefaultTtsVoice,
  getTtsModel,
  getVoiceDesignModel,
  hasApiKey,
} from '../utils/aiConfig.js';

export const TTS_MODE_META: Record<
  TtsMode,
  { label: string; modelHint: string; description: string }
> = {
  default: {
    label: '自然口播',
    modelHint: 'mimo-v2.5-tts',
    description: '预置精品音色 · 音频标签控制',
  },
  voicedesign: {
    label: '自定义音色',
    modelHint: 'mimo-v2.5-tts-voicedesign',
    description: '文字描述定制音色（不支持预置音色/音频标签）',
  },
};

/**
 * mimo-v2.5-tts 预置精品音色列表
 * 使用方式：{"audio":{"voice":"mimo_default"}}
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 */
export const PRESET_VOICES: Array<{
  id: string;
  name: string;
  language: string;
  gender: string;
  description?: string;
}> = [
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
];

const PRESET_VOICE_IDS = new Set(PRESET_VOICES.map((v) => v.id));

export function resolvePresetVoice(voice?: string): string {
  const candidate = voice?.trim() || getDefaultTtsVoice();
  if (PRESET_VOICE_IDS.has(candidate)) return candidate;
  // 非法 ID 回退默认预置音色，避免请求失败
  return getDefaultTtsVoice();
}

/**
 * 自然口播 · 开头风格标签（写入 assistant 开头）
 * 文档「音频标签控制」：在目标文本最开头添加 (风格) 控制整体气质
 * 例：(磁性)夜已经深了… / (怅然)这么多年过去了…
 */
export const SPEECH_STYLE_TAG_PRESETS = [
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

/**
 * 正文细粒度音频标签示例（可插在任意位置）
 * 文档：支持 () / （） / [] 等括号形式
 */
export const AUDIO_TAG_EXAMPLES = [
  // 语速与节奏
  '吸气',
  '深呼吸',
  '叹气',
  '长叹一口气',
  '喘息',
  '屏息',
  '语速加快',
  '沉默片刻',
  // 情绪状态
  '紧张',
  '激动',
  '疲惫',
  '委屈',
  '震惊',
  '不耐烦',
  // 语音特征
  '小声',
  '提高音量',
  '气声',
  '沙哑',
  '颤抖',
  // 哭笑表达
  '轻笑',
  '笑',
  '苦笑',
  '哽咽',
] as const;

/**
 * MiMo TTS 通过 chat/completions：
 * - default: model=mimo-v2.5-tts
 *   messages: 仅 assistant(待合成文本，可含音频标签)
 *   不支持 user 侧「风格指令」
 *   audio: { format: 'wav', voice: 预置音色ID }
 * - voicedesign: model=mimo-v2.5-tts-voicedesign
 *   messages: user(音色描述) + assistant(文本)
 *   不支持预置音色 / 音频风格标签
 * 返回 message.audio.data base64（通常为 WAV）
 */
export async function synthesizePodcastAudio(options: {
  script: string;
  sourceAudioPath: string;
  jobId: string;
  tts?: TtsOptions;
}): Promise<{ audioPath: string; demo: boolean; mode: TtsMode; voice?: string }> {
  const paths = jobPaths(options.jobId);
  await ensureDir(paths.dir);
  const mode: TtsMode = options.tts?.mode || 'default';
  const voice =
    mode === 'voicedesign' ? undefined : resolvePresetVoice(options.tts?.voice);
  const outPath = paths.podcastWav;
  const mp3Fallback = paths.podcastMp3;

  if (!hasApiKey()) {
    // 演示模式：尽量复用源音频；文本任务可能只有静音占位
    try {
      await copyFile(options.sourceAudioPath, mp3Fallback);
    } catch {
      // 源不存在时生成静音占位，避免整任务失败
      const { generateSilentMp3 } = await import('./audioExtractor.js');
      await generateSilentMp3(mp3Fallback, 2);
    }
    return { audioPath: mp3Fallback, demo: true, mode, voice };
  }

  // 控制单次 TTS 输入长度，避免超限；分段后顺序合成再拼接
  const chunks = splitScript(options.script, 500);
  const buffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    // 开头风格标签仅注入首段，避免每段重复叠加；正文内嵌标签随原文分段
    const body = buildTtsBody(chunks[i], options.tts, {
      applyLeadingStyle: i === 0,
    });
    const res = await aiFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`TTS 合成失败 (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { audio?: { data?: string } };
      }>;
    };
    const b64 = data.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error('TTS 返回缺少 audio.data');
    buffers.push(Buffer.from(b64, 'base64'));
  }

  const merged = mergeWavBuffers(buffers);
  const isWav = merged.slice(0, 4).toString() === 'RIFF';
  if (isWav) {
    await fs.writeFile(outPath, merged);
    // 转成 mp3，浏览器 seek/快进更稳定
    try {
      await convertToMp3(outPath, mp3Fallback);
      await removeIfExists(outPath);
      return { audioPath: mp3Fallback, demo: false, mode, voice };
    } catch {
      return { audioPath: outPath, demo: false, mode, voice };
    }
  }

  await fs.writeFile(mp3Fallback, merged);
  return { audioPath: mp3Fallback, demo: false, mode, voice };
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
 * 解析并重建 assistant 文本开头的风格标签。
 * 文档：目标文本最开头 (风格标签) + 正文；正文可继续内嵌细粒度标签。
 * 自然口播不强制任何默认标签。
 */
export function applyAssistantStyleTags(
  text: string,
  options?: {
    styleTags?: string[] | string;
    /** 是否注入/合并开头风格标签；分段合成时仅首段为 true */
    applyLeadingStyle?: boolean;
  },
): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return trimmed;

  const applyLeading = options?.applyLeadingStyle !== false;
  const requested = applyLeading ? normalizeStyleTagList(options?.styleTags) : [];

  // 解析已有前导风格标签：(tag1 tag2)body  或 （tag1 tag2）body  或 [tag1 tag2]body
  const m = trimmed.match(/^[\[\(（]\s*([^\]\)）]+?)\s*[\]\)）]\s*([\s\S]*)$/);
  let existing: string[] = [];
  let body = trimmed;
  if (m) {
    existing = normalizeStyleTagList(m[1].split(/[\s,，、/|]+/));
    body = m[2].trim();
  }

  const tags = normalizeStyleTagList([...existing, ...requested]);

  // 未指定标签时不加前缀，保留正文已有内嵌细粒度标签
  if (!tags.length) return body || trimmed;

  return `(${tags.join(' ')})${body || trimmed}`;
}

function buildTtsBody(
  text: string,
  tts?: TtsOptions,
  opts?: { applyLeadingStyle?: boolean },
) {
  const mode: TtsMode = tts?.mode || 'default';

  // 自定义音色：不支持预置音色 / 音频风格标签；user 仅为音色描述
  if (mode === 'voicedesign') {
    const design =
      tts?.voiceDesign?.trim() ||
      '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力';
    return {
      model: getVoiceDesignModel(),
      messages: [
        { role: 'user', content: design },
        { role: 'assistant', content: text },
      ],
      // 非流式统一返回 wav，便于后续拼接/转码
      audio: { format: 'wav' },
    };
  }

  // 自然口播：不支持 user 侧风格指令；仅靠 assistant 文本内音频标签控制
  // 文档：开头 (风格) + 正文内嵌（细粒度标签）
  const assistantText = applyAssistantStyleTags(text, {
    styleTags: tts?.styleTags,
    applyLeadingStyle: opts?.applyLeadingStyle,
  });

  return {
    model: getTtsModel(),
    messages: [{ role: 'assistant', content: assistantText }],
    audio: {
      format: 'wav',
      voice: resolvePresetVoice(tts?.voice),
    },
  };
}

function splitScript(text: string, maxLen: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxLen) return [normalized];

  const parts: string[] = [];
  let buf = '';
  const sentences = normalized.split(/(?<=[。！？!?\n])/);

  for (const s of sentences) {
    if (!s.trim()) continue;
    if ((buf + s).length > maxLen && buf) {
      parts.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [normalized.slice(0, maxLen)];
}

/**
 * 简单拼接多个 WAV：仅当全部为标准 PCM WAV 时合并 data chunk。
 * 若无法解析，退回直接 concat（多数情况下单段即可）。
 */
function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 1) return buffers[0];
  if (!buffers.every((b) => b.slice(0, 4).toString() === 'RIFF')) {
    return Buffer.concat(buffers);
  }

  try {
    const pcmParts: Buffer[] = [];
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;

    for (const buf of buffers) {
      const fmt = findChunk(buf, 'fmt ');
      const data = findChunk(buf, 'data');
      if (!fmt || !data) throw new Error('invalid wav');
      const ch = fmt.chunk.readUInt16LE(0);
      const sr = fmt.chunk.readUInt32LE(4);
      const bps = fmt.chunk.readUInt16LE(14);
      if (!sampleRate) {
        channels = ch;
        sampleRate = sr;
        bitsPerSample = bps;
      } else if (ch !== channels || sr !== sampleRate || bps !== bitsPerSample) {
        throw new Error('wav format mismatch');
      }
      pcmParts.push(data.chunk);
    }

    const pcm = Buffer.concat(pcmParts);
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  } catch {
    return buffers[0];
  }
}

function findChunk(
  buf: Buffer,
  id: string,
): { chunk: Buffer; offset: number } | null {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.slice(offset, offset + 4).toString('ascii');
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) return null;
    if (chunkId === id) {
      return { chunk: buf.slice(dataStart, dataEnd), offset: dataStart };
    }
    offset = dataEnd + (size % 2);
  }
  return null;
}
