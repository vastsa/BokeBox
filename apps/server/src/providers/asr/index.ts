import { getAsrProviderId } from '../../utils/aiConfig.js';
import type { ProviderDescriptor } from '../types.js';
import { demoAsrProvider } from './demoAsr.js';
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
 * 按配置解析 ASR 提供方；不可用时回落 demo。
 * 每次调用都读最新配置，换源无需重启。
 */
export function resolveAsrProvider(explicitId?: string): AsrProvider {
  const preferredId = (explicitId || getAsrProviderId() || 'mimo').trim();
  const preferred = registry.get(preferredId) || registry.get('mimo');
  if (preferred?.isAvailable()) return preferred;

  // 首选不可用时：若仍有 key，尽量用其他已注册且可用的真实提供方
  if (preferred && !preferred.isAvailable()) {
    for (const p of registry.values()) {
      if (p.id !== 'demo' && p.isAvailable()) return p;
    }
  }

  return registry.get('demo') || demoAsrProvider;
}

// 内置提供方
registerAsrProvider(mimoAsrProvider);
registerAsrProvider(openaiAsrProvider);
registerAsrProvider(demoAsrProvider);

export type { AsrProvider, AsrTranscribeInput, AsrTranscribeResult } from './types.js';
