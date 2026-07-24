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
  mergeWavBuffersWithGaps,
  resolveSentenceGapSec,
  MIMO_AUDIO_TAG_EXAMPLES,
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  resolveMimoPresetVoice,
  resolveTtsProvider,
  createTtsContext,
  assertTtsPluginConfigReady,
  splitScriptWithRanges,
  planSentenceStyleTags,
  applyPlannedStyleToSentence,
  wavDurationSec,
} from '../../providers/index.js';
import {
  buildScriptTiming,
  buildScriptTimingFromSpeechRanges,
  detectSilenceIntervals,
  isValidScriptTimingFile,
  probeAudioDurationSec,
  writePodcastSrt,
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
 * - 按句规划场景语气标签（全局风格底色 + 句级控制），不再整段复用同一套
 * - 句间插入静音 / 拼接转码 / 写时间轴与 SRT
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
    await writePodcastSrt(options.jobId, timing);
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
    // 按句规划场景语气：用户全局风格作底色 + 句内场景控制标签
    const acceptsStyle =
      providerAcceptsAudioTags(provider.meta.supportsStyleTags, mode) &&
      mode === 'default';
    let chunkText = chunks[i].text;
    let chunkTts = ttsForProvider;
    if (acceptsStyle) {
      const plan = planSentenceStyleTags(chunkText, {
        preferredStyle: ttsForProvider?.styleTags,
        index: i,
        total: chunks.length,
      });
      chunkText = applyPlannedStyleToSentence(chunkText, plan);
      // 句内已写入规划标签；避免 provider 再无脑重复整份全局 tags
      chunkTts = ttsForProvider
        ? { ...ttsForProvider, styleTags: plan.styleTags }
        : { mode: 'default', styleTags: plan.styleTags };
    }
    const chunkResult = await provider.synthesizeChunk(
      {
        text: chunkText,
        tts: chunkTts,
        // 每句都允许注入；具体标签已按场景裁剪
        applyLeadingStyle: acceptsStyle,
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

  // 句间静音：按句长/标点/段落自适应停顿，避免 0.3s 级硬切过于突然
  const allWav = buffers.every(
    (b) => detectAudioFormat(b) === 'wav' || b.slice(0, 4).toString() === 'RIFF',
  );
  const sentenceGapsSec = chunks.map((chunk, index) => {
    if (index >= chunks.length - 1) return 0;
    const next = chunks[index + 1];
    // 源文本里两句之间隔了换行，视为段落换气
    const between = synthesisScript.slice(chunk.sourceEnd, next.sourceStart);
    const isParagraphBreak = between.includes('\n');
    return resolveSentenceGapSec({
      text: chunk.text,
      durationSec: chunkDurationsSec[index] || 0,
      isParagraphBreak,
      isLast: false,
    });
  });

  let merged: Buffer;
  let speechRanges: Array<{ startSec: number; endSec: number }> | undefined;
  let appliedGapsSec: number[] = [];
  let totalDuration = 0;

  if (allWav) {
    const gapMerged = mergeWavBuffersWithGaps(buffers, sentenceGapsSec);
    merged = gapMerged.audio;
    speechRanges = gapMerged.speechRanges;
    appliedGapsSec = gapMerged.gapsSec || sentenceGapsSec.slice(0, -1);
    totalDuration =
      gapMerged.totalDurationSec ||
      wavDurationSec(merged) ||
      chunkDurationsSec.reduce((a, b) => a + b, 0);
  } else {
    // 非 WAV（少见）：无法安全插静音，直接拼接
    merged = Buffer.concat(buffers);
    totalDuration = chunkDurationsSec.reduce((a, b) => a + b, 0);
    if (chunkDurationsSec.every((value) => value > 0)) {
      let cursor = 0;
      speechRanges = chunkDurationsSec.map((dur) => {
        const range = { startSec: cursor, endSec: cursor + dur };
        cursor += dur;
        return range;
      });
    }
  }

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
        // 句间 gap 计入后续锚点：除末段外把 gap 并入该 chunk 占用时长
        durationSec:
          chunkDurationsSec[index] +
          (allWav && index < chunks.length - 1
            ? appliedGapsSec[index] || sentenceGapsSec[index] || 0
            : 0),
      }))
    : undefined;

  let timing: import('../job/scriptTiming.js').ScriptTimingFile | null = null;

  if (speechRanges?.length) {
    const candidate = buildScriptTimingFromSpeechRanges({
      script: synthesisScript,
      speechRanges,
      gapSec: allWav
        ? appliedGapsSec.reduce((a, b) => a + b, 0) /
          Math.max(1, appliedGapsSec.length)
        : 0,
      durationSec,
    });
    if (isValidScriptTimingFile(candidate)) {
      timing = candidate;
    }
  }

  if (!timing) {
    timing = buildScriptTiming({
      script: synthesisScript,
      durationSec,
      chunks: measuredChunks,
    });
  }

  // speech-range 不可用时，再尝试静音吸附精修
  if (timing.source !== 'measured' || !speechRanges?.length) {
    try {
      const silences = await detectSilenceIntervals(audioPath);
      if (silences.length) {
        const snapped = buildScriptTiming({
          script: synthesisScript,
          durationSec,
          chunks: measuredChunks,
          silences,
        });
        if (isValidScriptTimingFile(snapped)) timing = snapped;
      }
    } catch {
      // 静音分析失败时保留已有时间轴
    }
  }

  // 最终兜底：保证可写入
  if (!isValidScriptTimingFile(timing)) {
    timing = buildScriptTiming({
      script: synthesisScript,
      durationSec,
    });
  }
  if (!isValidScriptTimingFile(timing)) {
    throw new Error('拒绝写入无效的口播时间轴');
  }

  await writeScriptTiming(options.jobId, timing);
  await writePodcastSrt(options.jobId, timing);

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
