import fs from 'node:fs';
import path from 'node:path';
import { aiFetch, getAsrModel, hasApiKey } from '../../utils/aiConfig.js';
import type { AsrProvider, AsrTranscribeInput, AsrTranscribeResult } from './types.js';

function mimeOf(format: string): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
    case 'mpeg':
      return 'audio/mpeg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'application/octet-stream';
  }
}

/**
 * OpenAI 兼容 ASR：POST /audio/transcriptions（multipart）
 * 适用于 OpenAI Whisper / gpt-4o-transcribe 及兼容网关。
 */
export const openaiAsrProvider: AsrProvider = {
  id: 'openai',
  name: 'OpenAI 兼容 ASR',
  description: 'OpenAI /audio/transcriptions（Whisper 等兼容协议）',
  suggestedModel: 'whisper-1',
  isAvailable() {
    return hasApiKey('asr');
  },
  async transcribe(input: AsrTranscribeInput): Promise<AsrTranscribeResult> {
    const model = input.model?.trim() || getAsrModel() || 'whisper-1';
    const ext =
      input.format ||
      path.extname(input.audioPath).toLowerCase().replace('.', '') ||
      'mp3';
    const format = ext === 'mpeg' ? 'mp3' : ext;
    const filename = path.basename(input.audioPath) || `audio.${format}`;
    const bytes = fs.readFileSync(input.audioPath);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: mimeOf(format) }),
      filename,
    );
    form.append('model', model);
    if (input.language?.trim()) {
      form.append('language', input.language.trim());
    }

    const res = await aiFetch('/audio/transcriptions', {
      method: 'POST',
      body: form,
    }, 'asr');

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI 转写失败 (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) throw new Error('OpenAI 转写结果为空');

    return {
      text,
      provider: 'openai',
      model,
      demo: false,
    };
  },
};
