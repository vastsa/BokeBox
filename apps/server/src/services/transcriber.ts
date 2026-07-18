import path from 'node:path';
import { writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import {
  assertAsrPluginConfigReady,
  createAsrContext,
  resolveAsrProvider,
} from '../providers/asr/index.js';

interface TranscribeResult {
  text: string;
  demo: boolean;
  provider?: string;
  model?: string;
}

/**
 * 转写门面：按当前配置解析 ASR 插件并落盘。
 * 换源（asrProvider）/ 启停插件即时生效，无需重启进程。
 */
export async function transcribeAudio(
  audioPath: string,
  jobId: string,
): Promise<TranscribeResult> {
  const provider = resolveAsrProvider();
  assertAsrPluginConfigReady(provider.id);
  const format =
    path.extname(audioPath).toLowerCase().replace('.', '') || 'mp3';
  const ctx = createAsrContext(provider.id);

  const result = await provider.transcribe(
    {
      audioPath,
      format,
    },
    ctx,
  );

  const text = result.text?.trim();
  if (!text) throw new Error('转写结果为空');

  const outPath = jobPaths(jobId).transcript;
  await writeText(outPath, text);

  return {
    text,
    demo: Boolean(result.demo || provider.id === 'demo'),
    provider: result.provider || provider.id,
    model: result.model,
  };
}
