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
 * 解析并重建 assistant 文本开头的风格标签。
 * 自然口播不强制任何默认标签。
 */
export function applyAssistantStyleTags(
  text: string,
  options?: {
    styleTags?: string[] | string;
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
  if (m) {
    existing = normalizeStyleTagList(m[1].split(/[\s,，、/|]+/));
    body = m[2].trim();
  }

  const tags = normalizeStyleTagList([...existing, ...requested]);
  if (!tags.length) return body || trimmed;
  return `(${tags.join(' ')})${body || trimmed}`;
}

function buildMimoTtsBody(
  text: string,
  tts?: TtsOptions,
  opts?: { applyLeadingStyle?: boolean; model?: string; voiceDesignModel?: string },
) {
  const mode: TtsMode = tts?.mode || 'default';

  if (mode === 'voicedesign') {
    const design =
      tts?.voiceDesign?.trim() ||
      '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力';
    return {
      model: opts?.voiceDesignModel?.trim() || getVoiceDesignModel(),
      messages: [
        { role: 'user', content: design },
        { role: 'assistant', content: text },
      ],
      audio: { format: 'wav' as const },
      voice: undefined as string | undefined,
      resolvedMode: mode as TtsMode,
    };
  }

  const assistantText = applyAssistantStyleTags(text, {
    styleTags: tts?.styleTags,
    applyLeadingStyle: opts?.applyLeadingStyle,
  });
  const voice = resolveMimoPresetVoice(tts?.voice);

  return {
    model: opts?.model?.trim() || 'mimo-v2.5-tts',
    messages: [{ role: 'assistant', content: assistantText }],
    audio: {
      format: 'wav' as const,
      voice,
    },
    voice,
    resolvedMode: mode as TtsMode,
  };
}

export const mimoTtsProvider: TtsProvider = {
  id: 'mimo',
  meta: {
    id: 'mimo',
    name: 'MiMo TTS',
    description: '小米 MiMo：chat/completions 音频合成（默认）',
    modes: [
      {
        id: 'default',
        label: '自然口播',
        modelHint: 'mimo-v2.5-tts',
        description: '预置精品音色 · 音频标签控制',
      },
      {
        id: 'voicedesign',
        label: '自定义音色',
        modelHint: 'mimo-v2.5-tts-voicedesign',
        description: '文字描述定制音色（不支持预置音色/音频标签）',
      },
    ],
    voices: MIMO_PRESET_VOICES.map((v) => ({ ...v })),
    supportsStyleTags: true,
    supportsVoiceDesign: true,
    voiceUi: 'preset',
    maxCharsPerRequest: 500,
    suggestedModels: {
      tts: 'mimo-v2.5-tts',
      voiceDesign: 'mimo-v2.5-tts-voicedesign',
      defaultVoice: '冰糖',
    },
  },
  isAvailable() {
    return isCloudEndpointReady('tts', 'mimo');
  },
  async synthesizeChunk(
    input: TtsChunkInput,
    ctx?: TtsPluginContext,
  ): Promise<TtsChunkResult> {
    const ep = resolveCloudEndpoint('tts', 'mimo');
    const pluginModel =
      String(ctx?.getConfig?.('model') ?? '').trim() ||
      ep.model ||
      getTtsModel();
    const built = buildMimoTtsBody(input.text, input.tts, {
      applyLeadingStyle: input.applyLeadingStyle,
      model: input.model?.trim() || pluginModel || undefined,
      voiceDesignModel: input.voiceDesignModel,
    });

    const res = await pluginFetch(
      'tts',
      'mimo',
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: built.model,
          messages: built.messages,
          audio: built.audio,
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`MiMo TTS 合成失败 (${res.status}): ${errText}`);
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
      model: built.model,
      voice: built.voice,
      mode: built.resolvedMode,
      demo: false,
    };
  },
};
