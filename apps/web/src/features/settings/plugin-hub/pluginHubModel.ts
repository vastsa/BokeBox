/**
 * 插件中心：统一 Source / ASR / TTS 的描述映射与草稿工具
 */
import type {
  AiPluginDescriptor,
  SchedulePluginDescriptor,
  SourcePluginConfigField,
  SourcePluginDescriptor,
  SourceRiskLevel,
} from '../../../api/client';
import type { AiPluginKind } from '../../../api/client';

export type HubKind = 'source' | 'schedule' | AiPluginKind;

export type HubPlugin = {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SourceRiskLevel;
  defaultEnabled: boolean;
  enabled: boolean;
  available: boolean;
  origin: 'builtin' | 'external';
  loadError?: string;
  configSchema?: SourcePluginConfigField[];
  configValues?: Record<string, string | number | boolean | ''>;
  configStatus?: SourcePluginDescriptor['configStatus'];
  configReady?: boolean;
  active?: boolean;
};

export function riskClass(level: SourceRiskLevel): string {
  if (level === 'low') return 'is-low';
  if (level === 'medium') return 'is-medium';
  return 'is-high';
}

export function isSecretField(field: SourcePluginConfigField): boolean {
  if (typeof field.secret === 'boolean') return field.secret;
  return field.type === 'password';
}

export function buildDraft(plugin: HubPlugin): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of plugin.configSchema || []) {
    if (isSecretField(field)) {
      draft[field.key] = '';
      continue;
    }
    const raw = plugin.configValues?.[field.key];
    if (field.type === 'boolean') {
      draft[field.key] = raw === true || raw === 'true' ? 'true' : 'false';
    } else if (raw === undefined || raw === null) {
      draft[field.key] = '';
    } else {
      draft[field.key] = String(raw);
    }
  }
  return draft;
}

export function fromSource(p: SourcePluginDescriptor): HubPlugin {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
    riskLevel: p.riskLevel,
    defaultEnabled: p.defaultEnabled,
    enabled: p.enabled,
    available: p.available,
    origin: p.origin,
    loadError: p.loadError,
    configSchema: p.configSchema,
    configValues: p.configValues,
    configStatus: p.configStatus,
    configReady: p.configReady,
  };
}

export function fromSchedule(p: SchedulePluginDescriptor): HubPlugin {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
    riskLevel: p.riskLevel,
    defaultEnabled: p.defaultEnabled,
    enabled: p.enabled,
    available: p.available,
    origin: p.origin,
    loadError: p.loadError,
    configSchema: p.configSchema,
    configValues: p.configValues,
    configStatus: p.configStatus,
    configReady: p.configReady,
  };
}

export function fromAi(p: AiPluginDescriptor): HubPlugin {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
    riskLevel: p.riskLevel,
    defaultEnabled: p.defaultEnabled,
    enabled: p.enabled,
    available: p.available,
    origin: p.origin,
    loadError: p.loadError,
    configSchema: p.configSchema,
    configValues: p.configValues,
    configStatus: p.configStatus,
    configReady: p.configReady,
    active: p.active,
  };
}

export function fieldSpan(field: SourcePluginConfigField): 'full' | 'half' {
  if (field.type === 'textarea' || field.type === 'boolean') return 'full';
  if (field.type === 'password' || isSecretField(field)) return 'full';
  if ((field.description || '').length > 48) return 'full';
  return 'half';
}
