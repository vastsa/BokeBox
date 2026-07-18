import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { getDefaultTtsVoice } from '../../utils/aiConfig.js';
import { getPluginConfig } from '../../plugin-kit/persist.js';
import type {
  TtsChunkInput,
  TtsChunkResult,
  TtsPluginContext,
  TtsProvider,
} from './types.js';

/** Edge 神经音色（常用中英） */
export const EDGE_PRESET_VOICES = [
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '晓晓',
    language: '中文',
    gender: '女性',
    description: '温暖清晰，适合口播',
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '晓伊',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-YunxiNeural',
    name: '云希',
    language: '中文',
    gender: '男性',
    description: '阳光活力',
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '云健',
    language: '中文',
    gender: '男性',
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '云扬',
    language: '中文',
    gender: '男性',
    description: '新闻播报感',
  },
  {
    id: 'zh-CN-XiaochenNeural',
    name: '晓辰',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-XiaohanNeural',
    name: '晓涵',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-XiaomengNeural',
    name: '晓梦',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-XiaomoNeural',
    name: '晓墨',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-XiaoruiNeural',
    name: '晓睿',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-XiaoshuangNeural',
    name: '晓双',
    language: '中文',
    gender: '女性',
    description: '童声',
  },
  {
    id: 'zh-CN-XiaoxuanNeural',
    name: '晓萱',
    language: '中文',
    gender: '女性',
  },
  {
    id: 'zh-CN-YunfengNeural',
    name: '云枫',
    language: '中文',
    gender: '男性',
  },
  {
    id: 'zh-CN-YunhaoNeural',
    name: '云皓',
    language: '中文',
    gender: '男性',
  },
  {
    id: 'zh-CN-YunxiaNeural',
    name: '云夏',
    language: '中文',
    gender: '男性',
    description: '少年音',
  },
  {
    id: 'zh-CN-YunyeNeural',
    name: '云野',
    language: '中文',
    gender: '男性',
  },
  {
    id: 'zh-CN-YunzeNeural',
    name: '云泽',
    language: '中文',
    gender: '男性',
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria',
    language: '英文',
    gender: '女性',
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny',
    language: '英文',
    gender: '女性',
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy',
    language: '英文',
    gender: '男性',
  },
  {
    id: 'en-US-ChristopherNeural',
    name: 'Christopher',
    language: '英文',
    gender: '男性',
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia',
    language: '英文(英式)',
    gender: '女性',
  },
] as const;

const EDGE_VOICE_IDS = new Set(EDGE_PRESET_VOICES.map((v) => v.id));

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 去掉 MiMo 风格前导标签，避免被读出来 */
function stripLeadingStyleTags(text: string): string {
  return text
    .replace(/^[\[\(（]\s*[^\]\)）]+?\s*[\]\)）]\s*/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function resolveEdgeVoice(
  voice?: string,
  ctx?: TtsPluginContext,
): string {
  const pluginDefault =
    String(ctx?.getConfig?.('defaultVoice') ?? '').trim() ||
    String(getPluginConfig('tts', 'edge').defaultVoice || '').trim();
  const candidate = (
    voice ||
    pluginDefault ||
    getDefaultTtsVoice() ||
    ''
  ).trim();
  if (candidate && EDGE_VOICE_IDS.has(candidate as (typeof EDGE_PRESET_VOICES)[number]['id'])) {
    return candidate;
  }
  // 中文默认晓晓；英文默认 Aria；其它回落晓晓
  if (/^[a-z]{2}-[A-Z]{2}-/.test(candidate)) return candidate;
  return 'zh-CN-XiaoxiaoNeural';
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Microsoft Edge 在线 TTS（无需 API Key）
 * 依赖 msedge-tts → Edge Read Aloud
 */
export const edgeTtsProvider: TtsProvider = {
  id: 'edge',
  strictAvailability: true,
  meta: {
    id: 'edge',
    name: 'Edge TTS',
    description: '微软 Edge 在线神经音色，免费无需 API Key',
    modes: [
      {
        id: 'default',
        label: '神经音色',
        modelHint: 'edge-neural',
        description: 'Microsoft Edge Read Aloud',
      },
    ],
    voices: EDGE_PRESET_VOICES.map((v) => ({ ...v })),
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    // Edge 单次不宜过长，门面按此切段
    maxCharsPerRequest: 800,
    suggestedModels: {
      tts: 'edge-neural',
      defaultVoice: 'zh-CN-XiaoxiaoNeural',
    },
  },
  isAvailable() {
    // 需要外网；此处不探测网络，失败在合成时报错
    return true;
  },
  async synthesizeChunk(
    input: TtsChunkInput,
    ctx?: TtsPluginContext,
  ): Promise<TtsChunkResult> {
    const voice = resolveEdgeVoice(input.tts?.voice, ctx);
    const raw = stripLeadingStyleTags(input.text);
    if (!raw) throw new Error('Edge TTS 文本为空');

    // 防止 SSML 注入 / 非法字符
    const text = escapeXml(raw);

    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(
        voice,
        OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
      );
      const { audioStream } = tts.toStream(text);
      const audio = await streamToBuffer(audioStream);
      if (!audio.length) {
        throw new Error('Edge TTS 返回音频为空（请检查网络是否可访问微软服务）');
      }
      return {
        audio,
        format: 'mp3',
        provider: 'edge',
        model: 'edge-neural',
        voice,
        mode: 'default',
        demo: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Edge TTS 合成失败: ${msg}`);
    } finally {
      try {
        tts.close();
      } catch {
        // ignore
      }
    }
  },
};
