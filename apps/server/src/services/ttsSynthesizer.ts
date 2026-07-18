import fs from 'node:fs/promises';
import { jobPaths } from '../utils/paths.js';
import { copyFile, ensureDir, removeIfExists } from '../utils/fs.js';
import { convertToMp3 } from './audioExtractor.js';
import type { TtsMode, TtsOptions } from '../types/job.js';
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
  splitScript,
  wavDurationSec,
} from '../providers/index.js';
import {
  buildScriptTiming,
  detectSilenceIntervals,
  writeScriptTiming,
} from './scriptTiming.js';

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
};

/** @deprecated 兼容旧导入：MiMo 预置音色 */
export const PRESET_VOICES = MIMO_PRESET_VOICES.map((v) => ({ ...v }));

export const SPEECH_STYLE_TAG_PRESETS = MIMO_SPEECH_STYLE_TAGS;
export const AUDIO_TAG_EXAMPLES = MIMO_AUDIO_TAG_EXAMPLES;

export function resolvePresetVoice(voice?: string): string {
  return resolveMimoPresetVoice(voice);
}

export { applyAssistantStyleTags };

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
 * - 按提供方 maxChars 切段
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
  scriptTiming?: import('./scriptTiming.js').ScriptLineTiming[];
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
    const timing = buildScriptTiming({
      script: options.script,
      durationSec: 2,
    });
    await writeScriptTiming(options.jobId, timing);
    return {
      audioPath: mp3Fallback,
      demo: true,
      mode,
      voice:
        mode === 'voicedesign'
          ? undefined
          : options.tts?.voice || resolvePresetVoice(options.tts?.voice),
      provider: 'demo',
      scriptTiming: timing.lines,
    };
  }

  if (!provider.isAvailable()) {
    throw new Error(
      `TTS 提供方「${provider.meta.name || provider.id}」当前不可用，请检查配置或网络`,
    );
  }

  const maxChars = Math.max(80, provider.meta.maxCharsPerRequest || 500);
  const chunks = splitScript(options.script, maxChars);
  const buffers: Buffer[] = [];
  const chunkDurationsSec: number[] = [];
  let usedVoice: string | undefined =
    mode === 'voicedesign' ? undefined : options.tts?.voice;
  let usedMode: TtsMode = mode;

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await provider.synthesizeChunk(
      {
        text: chunks[i],
        tts: ttsForProvider,
        applyLeadingStyle: i === 0,
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

  let timing = buildScriptTiming({
    script: options.script,
    durationSec: totalDuration || 1,
    chunks,
    chunkDurationsSec,
  });
  try {
    const silences = await detectSilenceIntervals(audioPath);
    if (silences.length) {
      timing = buildScriptTiming({
        script: options.script,
        durationSec: totalDuration || 1,
        chunks,
        chunkDurationsSec,
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
  };
}
