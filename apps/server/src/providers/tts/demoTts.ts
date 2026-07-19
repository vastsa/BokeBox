import type { TtsProvider, TtsChunkInput, TtsChunkResult } from './types.js';

/** 演示 TTS：不真正合成，由门面复制源音频兜底 */
export const demoTtsProvider: TtsProvider = {
  id: 'demo',
  meta: {
    id: 'demo',
    name: '演示模式',
    description: '未配置 API Key 时由门面复用源音频/静音占位',
    modes: [
      {
        id: 'default',
        label: '演示',
        description: '不调用真实 TTS',
      },
    ],
    voices: [],
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    voiceUi: 'none',
    maxCharsPerRequest: 10_000,
  },
  isAvailable() {
    return true;
  },
  async synthesizeChunk(_input: TtsChunkInput): Promise<TtsChunkResult> {
    // 空 buffer：门面检测 demo 后走源音频复制逻辑
    return {
      audio: Buffer.alloc(0),
      format: 'unknown',
      provider: 'demo',
      demo: true,
      mode: 'default',
    };
  },
};
