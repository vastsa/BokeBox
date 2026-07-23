import fs from 'node:fs/promises';
import { stripAudioTags, type ScriptTimingSource } from '@bokebox/shared';
import { jobPaths } from '../../utils/paths.js';
import { copyFile, ensureDir, removeIfExists } from '../../utils/fs.js';
import { convertToMp3 } from './audioExtractor.js';
import type { TtsMode, TtsOptions } from '../../types/job.js';
import {
  applyAssistantStyleTags,
  detectAudioFormat,
  listTtsProviderDescriptors,
  mergeWavBuffers,
  MIMO_AUDIO_TAG_EXAMPLES,
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  resolveMimoPresetVoice,
  resolveTtsProvider,
  createTtsContext,
  assertTtsPluginConfigReady,
  splitScriptWithRanges,
  wavDurationSec,
} from '../../providers/index.js';
import {
  buildScriptTiming,
  detectSilenceIntervals,
  probeAudioDurationSec,
  writeScriptTiming,
} from '../job/scriptTiming.js';

/** @deprecated 兼容旧导入：映射自当前默认 MiMo 元数据 */
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
  voiceclone: {
    label: '音色克隆',
    modelHint: 'mimo-v2.5-tts-voiceclone',
    description: '参考音频克隆说话人音色',
  },
};

/** @deprecated 兼容旧导入：MiMo 预置音色 */
export const PRESET_VOICES = MIMO_PRESET_VOICES.map((v) => ({ ...v }));

export const SPEECH_STYLE_TAG_PRESETS = MIMO_SPEECH_STYLE_TAGS;
export const AUDIO_TAG_EXAMPLES = MIMO_AUDIO_TAG_EXAMPLES;

export function resolvePresetVoice(voice?: string): string {
  return resolveMimoPresetVoice(voice);
}

export { applyAssistantStyleTags };

/** 不支持控制标签的提供方必须收到与页面展示一致的纯正文。 */
export function prepareScriptForTtsProvider(
  script: string,
  supportsStyleTags: boolean,
): string {
  return supportsStyleTags ? script : stripAudioTags(script);
}

/** VoiceDesign 与普通提供方都不接受 MiMo 内联音频标签。 */
export function providerAcceptsAudioTags(
  supportsStyleTags: boolean,
  mode: TtsMode,
): boolean {
  return supportsStyleTags && mode === 'default';
}

/** 当前激活 TTS 提供方的模式/音色元数据（供 /health 等接口） */
export function getActiveTtsUiMeta() {
  const provider = resolveTtsProvider();
  const modes: Record<
    string,
    { label: string; modelHint: string; description: string }
  > = {};
  for (const m of provider.meta.modes) {
    modes[m.id] = {
      label: m.label,
      modelHint: m.modelHint || '',
      description: m.description || '',
    };
  }
  return {
    providerId: provider.id,
    providerName: provider.meta.name,
    ttsModes: Object.keys(modes).length ? modes : TTS_MODE_META,
    presetVoices: provider.meta.voices.length
      ? provider.meta.voices
      : PRESET_VOICES,
    supportsStyleTags: provider.meta.supportsStyleTags,
    supportsVoiceDesign: provider.meta.supportsVoiceDesign,
    speechStyleTags: provider.meta.supportsStyleTags
      ? [...SPEECH_STYLE_TAG_PRESETS]
      : [],
    audioTagExamples: provider.meta.supportsStyleTags
      ? [...AUDIO_TAG_EXAMPLES]
      : [],
    providers: listTtsProviderDescriptors(),
  };
}

/**
 * TTS 合成门面：
 * - 解析当前 TtsProvider（可热切换）
 * - 按句号/问号/叹号/换行一句一段（超长单句才按 maxChars 硬切）
 * - 每段都可注入风格标签，不再仅限首段
 * - 拼接 / 转码 / 写时间轴
 */
export async function synthesizePodcastAudio(options: {
  script: string;
  sourceAudioPath: string;
  jobId: string;
  tts?: TtsOptions;
}): Promise<{
  audioPath: string;
  demo: boolean;
  mode: TtsMode;
  voice?: string;
  provider?: string;
  scriptTiming?: import('../job/scriptTiming.js').ScriptLineTiming[];
  scriptTimingSource?: ScriptTimingSource;
}> {
  const paths = jobPaths(options.jobId);
  await ensureDir(paths.dir);
  const provider = resolveTtsProvider();
  assertTtsPluginConfigReady(provider.id);
  const ttsCtx = createTtsContext(provider.id);
  // 非 MiMo 提供方不支持 VoiceDesign / 风格标签
  const rawMode: TtsMode = options.tts?.mode || 'default';
  const mode: TtsMode =
    provider.id === 'mimo' ? rawMode : 'default';
  const ttsForProvider: TtsOptions | undefined =
    provider.id === 'mimo'
      ? options.tts
      : options.tts
        ? {
            mode: 'default',
            voice: options.tts.voice,
            voiceDesign: undefined,
            styleTags: undefined,
          }
        : undefined;
  const synthesisScript = prepareScriptForTtsProvider(
    options.script,
    providerAcceptsAudioTags(provider.meta.supportsStyleTags, mode),
  );
  if (!synthesisScript.trim()) {
    throw new Error('口播脚本没有可合成的正文');
  }
  const outPath = paths.podcastWav;
  const mp3Fallback = paths.podcastMp3;

  // 演示提供方：复用源音频或静音占位
  if (provider.id === 'demo') {
    try {
      await copyFile(options.sourceAudioPath, mp3Fallback);
    } catch {
      const { generateSilentMp3 } = await import('./audioExtractor.js');
      await generateSilentMp3(mp3Fallback, 2);
    }
    const durationSec = (await probeAudioDurationSec(mp3Fallback)) || 2;
    const timing = buildScriptTiming({
      script: synthesisScript,
      durationSec,
    });
    await writeScriptTiming(options.jobId, timing);
    return {
      audioPath: mp3Fallback,
      demo: true,
      mode,
      voice:
        mode === 'voicedesign' || mode === 'voiceclone'
          ? mode === 'voiceclone'
            ? 'voiceclone'
            : undefined
          : options.tts?.voice || resolvePresetVoice(options.tts?.voice),
      provider: 'demo',
      scriptTiming: timing.lines,
      scriptTimingSource: timing.source,
    };
  }

  if (!provider.isAvailable()) {
    throw new Error(
      `TTS 提供方「${provider.meta.name || provider.id}」当前不可用，请检查配置或网络`,
    );
  }

  // maxChars 只兜底「单句过长」；正常路径按句号一句一合成
  const maxChars = Math.max(80, provider.meta.maxCharsPerRequest || 500);
  const chunks = splitScriptWithRanges(synthesisScript, maxChars);
  const buffers: Buffer[] = [];
  const chunkDurationsSec: number[] = [];
  let usedVoice: string | undefined =
    mode === 'voicedesign'
      ? undefined
      : mode === 'voiceclone'
        ? 'voiceclone'
        : options.tts?.voice;
  let usedMode: TtsMode = mode;

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await provider.synthesizeChunk(
      {
        text: chunks[i].text,
        tts: ttsForProvider,
        // 每句都注入语气/风格标签，避免只有首段带情绪
        applyLeadingStyle: true,
      },
      ttsCtx,
    );
    if (chunkResult.demo) {
      // 理论不应到这：isAvailable 已过滤
      throw new Error('TTS 提供方返回演示结果');
    }
    buffers.push(chunkResult.audio);
    const dur =
      chunkResult.format === 'wav' || detectAudioFormat(chunkResult.audio) === 'wav'
        ? wavDurationSec(chunkResult.audio)
        : 0;
    chunkDurationsSec.push(dur);
    if (chunkResult.voice) usedVoice = chunkResult.voice;
    if (chunkResult.mode) usedMode = chunkResult.mode;
  }

  const allWav = buffers.every(
    (b) => detectAudioFormat(b) === 'wav' || b.slice(0, 4).toString() === 'RIFF',
  );
  const merged = allWav ? mergeWavBuffers(buffers) : Buffer.concat(buffers);
  const totalDuration =
    chunkDurationsSec.reduce((a, b) => a + b, 0) ||
    (allWav ? wavDurationSec(merged) : 0);

  const format = detectAudioFormat(merged);
  let audioPath = mp3Fallback;
  if (format === 'wav' || allWav) {
    await fs.writeFile(outPath, merged);
    try {
      await convertToMp3(outPath, mp3Fallback);
      await removeIfExists(outPath);
      audioPath = mp3Fallback;
    } catch {
      audioPath = outPath;
    }
  } else {
    await fs.writeFile(mp3Fallback, merged);
    audioPath = mp3Fallback;
  }

  const probedDuration = await probeAudioDurationSec(audioPath);
  const durationSec = probedDuration > 0 ? probedDuration : totalDuration;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('合成音频时长探测失败，已停止写入不可靠时间轴');
  }

  const measuredChunks = chunkDurationsSec.every((value) => value > 0)
    ? chunks.map((chunk, index) => ({
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        durationSec: chunkDurationsSec[index],
      }))
    : undefined;

  let timing = buildScriptTiming({
    script: synthesisScript,
    durationSec,
    chunks: measuredChunks,
  });
  try {
    const silences = await detectSilenceIntervals(audioPath);
    if (silences.length) {
      timing = buildScriptTiming({
        script: synthesisScript,
        durationSec,
        chunks: measuredChunks,
        silences,
      });
    }
  } catch {
    // 静音分析失败时保留分块实测
  }
  await writeScriptTiming(options.jobId, timing);

  return {
    audioPath,
    demo: false,
    mode: usedMode,
    voice: usedVoice,
    provider: provider.id,
    scriptTiming: timing.lines,
    scriptTimingSource: timing.source,
  };
}
