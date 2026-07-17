import path from 'node:path';
import type { AsrProvider, AsrTranscribeInput, AsrTranscribeResult } from './types.js';

function buildDemoText(audioPath: string): string {
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

/** 无密钥 / 不可用时的演示 ASR */
export const demoAsrProvider: AsrProvider = {
  id: 'demo',
  name: '演示模式',
  description: '未配置 API Key 时返回固定演示转写稿',
  suggestedModel: undefined,
  isAvailable() {
    return true;
  },
  async transcribe(input: AsrTranscribeInput): Promise<AsrTranscribeResult> {
    return {
      text: buildDemoText(input.audioPath),
      provider: 'demo',
      demo: true,
    };
  },
};
