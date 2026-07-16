import fs from 'node:fs';
import path from 'node:path';
import { writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import { aiFetch, getAsrModel, hasApiKey } from '../utils/aiConfig.js';

interface TranscribeResult {
  text: string;
  demo: boolean;
}

function demoTranscript(audioPath: string): string {
  const name = path.basename(audioPath, path.extname(audioPath));
  return [
    `【演示转写】任务 ${name}`,
    '',
    '大家好，欢迎收听本期内容。',
    '今天我们聚焦三件事：如何把长视频沉淀为播客、怎样提炼可口播的脚本，以及如何让听众在通勤时也能跟上核心观点。',
    '',
    '第一，内容定位。很多创作者已经有视频资产，但缺少音频分发渠道。把视频转成播客，可以覆盖开车、散步、健身这些无法看屏幕的场景。',
    '第二，结构重组。原视频转写稿通常口语化、重复多，需要重新编排开场、主题段落和收尾，让听感更顺。',
    '第三，行动建议。如果你要做个人品牌，建议每周固定产出一集 8 到 15 分钟的精华播客，而不是完整搬运全部视频时长。',
    '感谢收听，我们下期见。',
  ].join('\n');
}

/**
 * MiMo ASR：通过 chat/completions + input_audio。
 * 注意：请求中不能夹带文本 part，文本提示由网关注入。
 */
async function mimoAsr(audioPath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(audioPath);
  const b64 = fileBuffer.toString('base64');
  const ext = path.extname(audioPath).toLowerCase().replace('.', '') || 'mp3';
  const format = ext === 'mpeg' ? 'mp3' : ext;

  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getAsrModel(),
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
    throw new Error(`转写失败 (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('转写结果为空');
  return text;
}

export async function transcribeAudio(
  audioPath: string,
  jobId: string,
): Promise<TranscribeResult> {
  const text = hasApiKey() ? await mimoAsr(audioPath) : demoTranscript(audioPath);
  const outPath = jobPaths(jobId).transcript;
  await writeText(outPath, text);
  return { text, demo: !hasApiKey() };
}
