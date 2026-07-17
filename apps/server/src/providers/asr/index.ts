import { getAsrProviderId } from '../../utils/aiConfig.js';
import type { ProviderDescriptor } from '../types.js';
import { demoAsrProvider } from './demoAsr.js';
import { localWhisperAsrProvider } from './localWhisperAsr.js';
import { mimoAsrProvider } from './mimoAsr.js';
import { openaiAsrProvider } from './openaiAsr.js';
import type { AsrProvider } from './types.js';
import { toAsrDescriptor } from './types.js';

const registry = new Map<string, AsrProvider>();

/** 注册 ASR 提供方（可热插拔扩展） */
export function registerAsrProvider(provider: AsrProvider): void {
  registry.set(provider.id, provider);
}

export function listAsrProviders(): AsrProvider[] {
  return [...registry.values()];
}

export function listAsrProviderDescriptors(): ProviderDescriptor[] {
  return listAsrProviders().map(toAsrDescriptor);
}

export function getAsrProviderById(id: string): AsrProvider | undefined {
  return registry.get(id);
}

/**
 * 按配置解析 ASR 提供方。
 * - 每次读最新配置（热切换）
 * - strictAvailability 源在不可用时仍返回自身，由 transcribe 抛明确错误
 * - 云端源不可用时回落其他可用源 / demo
 */
export function resolveAsrProvider(explicitId?: string): AsrProvider {
  const preferredId = (explicitId || getAsrProviderId() || 'mimo').trim();
  const preferred = registry.get(preferredId) || registry.get('mimo');

  if (preferred) {
    if (preferred.isAvailable()) return preferred;
    if (preferred.strictAvailability && preferred.id === preferredId) {
      return preferred;
    }
  }

  for (const p of registry.values()) {
    if (p.id !== 'demo' && p.isAvailable()) return p;
  }

  return registry.get('demo') || demoAsrProvider;
}

// 内置提供方
registerAsrProvider(mimoAsrProvider);
registerAsrProvider(openaiAsrProvider);
registerAsrProvider(localWhisperAsrProvider);
registerAsrProvider(demoAsrProvider);

export type { AsrProvider, AsrTranscribeInput, AsrTranscribeResult } from './types.js';
