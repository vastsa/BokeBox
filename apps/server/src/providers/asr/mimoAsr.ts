import fs from 'node:fs';
import path from 'node:path';
import { aiFetch, getAsrModel, hasApiKey } from '../../utils/aiConfig.js';
import type { AsrProvider, AsrTranscribeInput, AsrTranscribeResult } from './types.js';

/**
 * MiMo ASR：chat/completions + input_audio
 * 注意：请求中不能夹带文本 part，文本提示由网关注入。
 */
export const mimoAsrProvider: AsrProvider = {
  id: 'mimo',
  name: 'MiMo ASR',
  description: '小米 MiMo：chat/completions + input_audio（默认）',
  suggestedModel: 'mimo-v2.5-asr',
  isAvailable() {
    return hasApiKey();
  },
  async transcribe(input: AsrTranscribeInput): Promise<AsrTranscribeResult> {
    const model = input.model?.trim() || getAsrModel();
    const fileBuffer = fs.readFileSync(input.audioPath);
    const b64 = fileBuffer.toString('base64');
    const ext =
      input.format ||
      path.extname(input.audioPath).toLowerCase().replace('.', '') ||
      'mp3';
    const format = ext === 'mpeg' ? 'mp3' : ext;

    const res = await aiFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: b64,
                  format,
                },
              },
            ],
          },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MiMo 转写失败 (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('MiMo 转写结果为空');

    return {
      text,
      provider: 'mimo',
      model,
      demo: false,
    };
  },
};
