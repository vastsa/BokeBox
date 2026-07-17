import { aiFetch, getDefaultTtsVoice, getTtsModel, hasApiKey } from '../../utils/aiConfig.js';
import type { TtsProvider, TtsChunkInput, TtsChunkResult } from './types.js';

/** OpenAI TTS 预置音色 */
export const OPENAI_PRESET_VOICES = [
  { id: 'alloy', name: 'Alloy', language: '多语', gender: '-' },
  { id: 'ash', name: 'Ash', language: '多语', gender: '-' },
  { id: 'ballad', name: 'Ballad', language: '多语', gender: '-' },
  { id: 'coral', name: 'Coral', language: '多语', gender: '-' },
  { id: 'echo', name: 'Echo', language: '多语', gender: '-' },
  { id: 'fable', name: 'Fable', language: '多语', gender: '-' },
  { id: 'onyx', name: 'Onyx', language: '多语', gender: '-' },
  { id: 'nova', name: 'Nova', language: '多语', gender: '-' },
  { id: 'sage', name: 'Sage', language: '多语', gender: '-' },
  { id: 'shimmer', name: 'Shimmer', language: '多语', gender: '-' },
  { id: 'verse', name: 'Verse', language: '多语', gender: '-' },
] as const;

const OPENAI_VOICE_IDS = new Set(OPENAI_PRESET_VOICES.map((v) => v.id));

function resolveOpenAiVoice(voice?: string): string {
  const candidate = (voice?.trim() || getDefaultTtsVoice() || 'alloy').toLowerCase();
  if (OPENAI_VOICE_IDS.has(candidate as (typeof OPENAI_PRESET_VOICES)[number]['id'])) {
    return candidate;
  }
  // 常见默认 / 非 OpenAI 音色回落
  return 'alloy';
}

/**
 * OpenAI 兼容 TTS：POST /audio/speech
 * 统一请求 wav，便于门面拼接。
 */
export const openaiTtsProvider: TtsProvider = {
  id: 'openai',
  meta: {
    id: 'openai',
    name: 'OpenAI 兼容 TTS',
    description: 'OpenAI /audio/speech（tts-1 / gpt-4o-mini-tts 等）',
    modes: [
      {
        id: 'default',
        label: '标准合成',
        modelHint: 'tts-1',
        description: '预置音色口播合成',
      },
    ],
    voices: OPENAI_PRESET_VOICES.map((v) => ({ ...v })),
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    maxCharsPerRequest: 2000,
    suggestedModels: {
      tts: 'tts-1',
      defaultVoice: 'alloy',
    },
  },
  isAvailable() {
    return hasApiKey('tts');
  },
  async synthesizeChunk(input: TtsChunkInput): Promise<TtsChunkResult> {
    const model = input.model?.trim() || getTtsModel() || 'tts-1';
    const voice = resolveOpenAiVoice(input.tts?.voice);
    // OpenAI TTS 不支持 MiMo 风格标签；清理可能残留的前导括号标签以免读出来
    const text = input.text
      .replace(/^[\[\(（]\s*[^\]\)）]+?\s*[\]\)）]\s*/, '')
      .trim();

    if (!text) {
      throw new Error('OpenAI TTS 文本为空');
    }

    const res = await aiFetch(
      '/audio/speech',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: 'wav',
        }),
      },
      'tts',
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI TTS 合成失败 (${res.status}): ${errText}`);
    }

    const ab = await res.arrayBuffer();
    const audio = Buffer.from(ab);
    if (!audio.length) throw new Error('OpenAI TTS 返回音频为空');

    return {
      audio,
      format: 'wav',
      provider: 'openai',
      model,
      voice,
      mode: 'default',
      demo: false,
    };
  },
};
