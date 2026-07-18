import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getAsrModel } from '../../utils/aiConfig.js';
import { resolveFfmpegPath } from '../../utils/ffmpeg.js';
import { ensureDir, pathExists, removeDirIfExists } from '../../utils/fs.js';
import { probeAudioDurationSec } from '../../services/scriptTiming.js';
import {
  isCloudEndpointReady,
  pluginFetch,
  resolveCloudEndpoint,
} from '../pluginEndpoint.js';
import type {
  AsrPluginContext,
  AsrProvider,
  AsrTranscribeInput,
  AsrTranscribeResult,
} from './types.js';

const execFileAsync = promisify(execFile);

/**
 * MiMo ASR 上下文约 8192 tokens（含 completion 预留）。
 * 整段长音频 base64 很容易把 input 顶满 → 400 context length。
 * 策略：超过阈值主动切段；整段失败且像上下文错误时降级切段。
 */
const DEFAULT_CHUNK_SEC = 60;
/** 短于此秒数优先整段；失败再切 */
const WHOLE_TRY_MAX_SEC = 75;
/** 单段 completion 预留，给 input 留空间 */
const MAX_COMPLETION_TOKENS = 1024;
const SLICE_TIMEOUT_MS = 120_000;
const MIN_CHUNK_SEC = 15;

function ffmpegBin(): string | null {
  return resolveFfmpegPath();
}

function normalizeFormat(input: AsrTranscribeInput): string {
  const ext =
    input.format ||
    path.extname(input.audioPath).toLowerCase().replace('.', '') ||
    'mp3';
  return ext === 'mpeg' ? 'mp3' : ext;
}

function isContextLengthError(status: number, body: string): boolean {
  if (status !== 400 && status !== 413) return false;
  const s = String(body || '').toLowerCase();
  return (
    s.includes('maximum context length') ||
    s.includes('context_length') ||
    s.includes('context length') ||
    s.includes('too many tokens') ||
    s.includes('token count exceeds') ||
    s.includes('max context') ||
    s.includes('prompt is too long')
  );
}

/** 按目标秒数切分 [0, duration)，最后一段可略短 */
export function planAudioChunks(
  durationSec: number,
  chunkSec = DEFAULT_CHUNK_SEC,
): Array<{ start: number; duration: number; index: number }> {
  const total = Math.max(0, Number(durationSec) || 0);
  const size = Math.max(MIN_CHUNK_SEC, Number(chunkSec) || DEFAULT_CHUNK_SEC);
  if (total <= 0) {
    return [{ start: 0, duration: size, index: 0 }];
  }
  if (total <= size + 5) {
    return [{ start: 0, duration: total, index: 0 }];
  }
  const chunks: Array<{ start: number; duration: number; index: number }> = [];
  let start = 0;
  let index = 0;
  while (start < total - 0.05) {
    const remain = total - start;
    // 末段过短则并入前一段（仅当已有段）
    if (remain < MIN_CHUNK_SEC && chunks.length > 0) {
      const prev = chunks[chunks.length - 1]!;
      prev.duration = Number((prev.duration + remain).toFixed(3));
      break;
    }
    const dur = Math.min(size, remain);
    chunks.push({
      start: Number(start.toFixed(3)),
      duration: Number(dur.toFixed(3)),
      index,
    });
    start += dur;
    index += 1;
  }
  return chunks.length ? chunks : [{ start: 0, duration: total, index: 0 }];
}

async function sliceAudioSegment(opts: {
  inputPath: string;
  outputPath: string;
  startSec: number;
  durationSec: number;
}): Promise<void> {
  const bin = ffmpegBin();
  if (!bin) {
    throw new Error('缺少 ffmpeg，无法切分音频做分段转写（请安装 ffmpeg 或配置 FFMPEG_BIN）');
  }
  await ensureDir(path.dirname(opts.outputPath));
  // -ss 在 -i 后更准；ASR 用 16k mono mp3 即可
  await execFileAsync(
    bin,
    [
      '-y',
      '-ss',
      String(Math.max(0, opts.startSec)),
      '-i',
      opts.inputPath,
      '-t',
      String(Math.max(0.2, opts.durationSec)),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      opts.outputPath,
    ],
    { timeout: SLICE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  if (!(await pathExists(opts.outputPath))) {
    throw new Error(`切分音频失败：未生成 ${path.basename(opts.outputPath)}`);
  }
}

async function callMimoAsrOnce(opts: {
  audioPath: string;
  format: string;
  model: string;
}): Promise<string> {
  const fileBuffer = fs.readFileSync(opts.audioPath);
  if (!fileBuffer.length) {
    throw new Error('音频文件为空，无法转写');
  }
  const b64 = fileBuffer.toString('base64');

  const res = await pluginFetch(
    'asr',
    'mimo',
    '/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: opts.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: b64,
                  format: opts.format,
                },
              },
            ],
          },
        ],
        temperature: 0,
        // 压低 completion 预留，避免 8192 窗口被输出额度挤爆
        max_tokens: MAX_COMPLETION_TOKENS,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`MiMo 转写失败 (${res.status}): ${body}`) as Error & {
      status?: number;
      body?: string;
      contextLength?: boolean;
    };
    err.status = res.status;
    err.body = body;
    err.contextLength = isContextLengthError(res.status, body);
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('MiMo 转写结果为空');
  return text;
}

function joinChunkTexts(parts: string[]): string {
  return parts
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function transcribeInChunks(opts: {
  audioPath: string;
  format: string;
  model: string;
  durationSec: number;
  chunkSec?: number;
}): Promise<{ text: string; chunks: number }> {
  const plan = planAudioChunks(opts.durationSec, opts.chunkSec ?? DEFAULT_CHUNK_SEC);
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'bokebox-mimo-asr-'));
  const texts: string[] = [];

  try {
    for (const seg of plan) {
      const partPath = path.join(
        tmpRoot,
        `part-${String(seg.index).padStart(3, '0')}.mp3`,
      );
      // eslint-disable-next-line no-await-in-loop
      await sliceAudioSegment({
        inputPath: opts.audioPath,
        outputPath: partPath,
        startSec: seg.start,
        durationSec: seg.duration,
      });

      let text: string;
      try {
        // eslint-disable-next-line no-await-in-loop
        text = await callMimoAsrOnce({
          audioPath: partPath,
          format: 'mp3',
          model: opts.model,
        });
      } catch (err) {
        const e = err as Error & { contextLength?: boolean };
        // 单段仍超限：再对半切一次
        if (e.contextLength && seg.duration > MIN_CHUNK_SEC * 1.5) {
          const half = seg.duration / 2;
          const subPlan = [
            { start: seg.start, duration: half, index: 0 },
            { start: seg.start + half, duration: seg.duration - half, index: 1 },
          ];
          const subTexts: string[] = [];
          for (const sub of subPlan) {
            const subPath = path.join(
              tmpRoot,
              `part-${String(seg.index).padStart(3, '0')}-h${sub.index}.mp3`,
            );
            // eslint-disable-next-line no-await-in-loop
            await sliceAudioSegment({
              inputPath: opts.audioPath,
              outputPath: subPath,
              startSec: sub.start,
              durationSec: sub.duration,
            });
            // eslint-disable-next-line no-await-in-loop
            const subText = await callMimoAsrOnce({
              audioPath: subPath,
              format: 'mp3',
              model: opts.model,
            });
            subTexts.push(subText);
          }
          text = joinChunkTexts(subTexts);
        } else {
          throw err;
        }
      }
      texts.push(text);
    }
  } finally {
    await removeDirIfExists(tmpRoot);
  }

  const merged = joinChunkTexts(texts);
  if (!merged) throw new Error('MiMo 分段转写结果为空');
  return { text: merged, chunks: plan.length };
}

/**
 * MiMo ASR：chat/completions + input_audio
 * 注意：请求中不能夹带文本 part，文本提示由网关注入。
 * 长音频自动分段，避免 8192 上下文超限。
 */
export const mimoAsrProvider: AsrProvider = {
  id: 'mimo',
  name: 'MiMo ASR',
  description: '小米 MiMo：chat/completions + input_audio（长音频自动分段）',
  suggestedModel: 'mimo-v2.5-asr',
  isAvailable() {
    return isCloudEndpointReady('asr', 'mimo');
  },
  async transcribe(
    input: AsrTranscribeInput,
    ctx?: AsrPluginContext,
  ): Promise<AsrTranscribeResult> {
    const ep = resolveCloudEndpoint('asr', 'mimo');
    const model =
      input.model?.trim() ||
      String(ctx?.getConfig?.('model') ?? '').trim() ||
      ep.model ||
      getAsrModel() ||
      'mimo-v2.5-asr';
    const format = normalizeFormat(input);
    const audioPath = input.audioPath;

    if (!(await pathExists(audioPath))) {
      throw new Error('ASR 音频文件不存在');
    }

    const durationSec = await probeAudioDurationSec(audioPath);
    const shouldChunk =
      durationSec > WHOLE_TRY_MAX_SEC ||
      // 时长未知时：64kbps 约 8KB/s，> ~600KB 倾向切段
      (durationSec <= 0 && fs.statSync(audioPath).size > 600 * 1024);

    if (!shouldChunk) {
      try {
        const text = await callMimoAsrOnce({ audioPath, format, model });
        return { text, provider: 'mimo', model, demo: false };
      } catch (err) {
        const e = err as Error & { contextLength?: boolean };
        if (!e.contextLength) throw err;
        // 整段超限 → 强制切段
        const fallbackDuration =
          durationSec > 0
            ? durationSec
            : Math.max(
                DEFAULT_CHUNK_SEC,
                // 粗估：文件字节 / (64kbps/8)
                fs.statSync(audioPath).size / 8000,
              );
        const { text } = await transcribeInChunks({
          audioPath,
          format,
          model,
          durationSec: fallbackDuration,
          chunkSec: Math.min(DEFAULT_CHUNK_SEC, 45),
        });
        return { text, provider: 'mimo', model, demo: false };
      }
    }

    const { text } = await transcribeInChunks({
      audioPath,
      format,
      model,
      durationSec:
        durationSec > 0
          ? durationSec
          : Math.max(DEFAULT_CHUNK_SEC * 2, fs.statSync(audioPath).size / 8000),
    });

    return { text, provider: 'mimo', model, demo: false };
  },
};
