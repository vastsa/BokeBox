import type { ProviderDescriptor, ProviderId } from '../types.js';

export interface AsrTranscribeInput {
  audioPath: string;
  /** 文件扩展名 / 容器格式提示，如 mp3、wav */
  format?: string;
  /** 覆盖配置中的模型名 */
  model?: string;
  /** 可选语言提示（部分协议支持） */
  language?: string;
}

export interface AsrTranscribeResult {
  text: string;
  provider: ProviderId;
  model?: string;
  demo?: boolean;
}

export interface AsrProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly description: string;
  readonly suggestedModel?: string;
  isAvailable(): boolean;
  transcribe(input: AsrTranscribeInput): Promise<AsrTranscribeResult>;
}

export function toAsrDescriptor(p: AsrProvider): ProviderDescriptor {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    available: p.isAvailable(),
    suggestedModels: p.suggestedModel ? { asr: p.suggestedModel } : undefined,
  };
}
