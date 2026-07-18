/**
 * 通用插件配置 schema 规范化与公开回显
 */
import {
  getPluginConfig,
  resetPluginConfig as resetPersistedConfig,
  setPluginConfig,
} from './persist.js';
import type {
  PluginConfigField,
  PluginConfigFieldStatus,
  PluginConfigFieldType,
  PluginConfigMap,
  PluginConfigValue,
} from './types.js';

const FIELD_TYPES = new Set<PluginConfigFieldType>([
  'string',
  'password',
  'number',
  'boolean',
  'select',
  'textarea',
]);

/** 配置 key 合法字符（与历史 Source schema 一致） */
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

export function isSecretField(field: PluginConfigField): boolean {
  if (typeof field.secret === 'boolean') return field.secret;
  return field.type === 'password';
}

function secretHint(value: string): string {
  const s = value.trim();
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

export function normalizeConfigSchema(raw: unknown): PluginConfigField[] {
  if (!Array.isArray(raw)) return [];
  const out: PluginConfigField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const key = String(obj.key || '').trim();
    const label = String(obj.label || '').trim();
    const type = String(obj.type || 'string').trim() as PluginConfigFieldType;
    if (!key || !KEY_RE.test(key) || seen.has(key) || !label || !FIELD_TYPES.has(type)) continue;
    seen.add(key);

    const field: PluginConfigField = {
      key,
      label,
      type,
    };
    if (typeof obj.description === 'string') field.description = obj.description;
    if (typeof obj.required === 'boolean') field.required = obj.required;
    if (typeof obj.placeholder === 'string') field.placeholder = obj.placeholder;
    if (typeof obj.secret === 'boolean') field.secret = obj.secret;
    if (
      typeof obj.default === 'string' ||
      typeof obj.default === 'number' ||
      typeof obj.default === 'boolean'
    ) {
      field.default = obj.default;
    }
    if (Array.isArray(obj.options)) {
      field.options = obj.options
        .filter((o) => o && typeof o === 'object' && !Array.isArray(o))
        .map((o) => {
          const opt = o as Record<string, unknown>;
          return {
            value: String(opt.value ?? ''),
            label: String(opt.label ?? opt.value ?? ''),
          };
        })
        .filter((o) => o.value);
    }
    out.push(field);
  }
  return out;
}

/** 运行时 schema 优先，再合并清单 schema（按 key 去重） */
export function mergeConfigSchema(
  runtime?: readonly PluginConfigField[] | undefined,
  manifest?: readonly PluginConfigField[] | undefined,
): PluginConfigField[] {
  const map = new Map<string, PluginConfigField>();
  for (const f of normalizeConfigSchema(manifest || [])) map.set(f.key, f);
  for (const f of normalizeConfigSchema(runtime || [])) map.set(f.key, f);
  return [...map.values()];
}

function isConfigValueSet(
  field: PluginConfigField,
  value: PluginConfigValue | undefined,
): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

export function isPluginConfigReady(
  namespace: string,
  pluginId: string,
  schema: readonly PluginConfigField[] | undefined,
): boolean {
  const fields = schema || [];
  if (!fields.length) return true;
  const config = getPluginConfig(namespace, pluginId);
  for (const field of fields) {
    if (!field.required) continue;
    const value =
      config[field.key] !== undefined ? config[field.key] : field.default;
    if (!isConfigValueSet(field, value as PluginConfigValue | undefined)) {
      return false;
    }
  }
  return true;
}

export function resolveRuntimeConfig(
  namespace: string,
  pluginId: string,
  schema: readonly PluginConfigField[] | undefined,
): PluginConfigMap {
  const fields = schema || [];
  const stored = getPluginConfig(namespace, pluginId);
  const out: PluginConfigMap = { ...stored };
  for (const field of fields) {
    if (out[field.key] === undefined && field.default !== undefined) {
      out[field.key] = field.default;
    }
  }
  return out;
}

export function toPublicPluginConfig(
  namespace: string,
  pluginId: string,
  schema: readonly PluginConfigField[] | undefined,
): {
  configSchema: PluginConfigField[];
  configValues: Record<string, PluginConfigValue | ''>;
  configStatus: Record<string, PluginConfigFieldStatus>;
  configReady: boolean;
} {
  const fields = normalizeConfigSchema(schema || []);
  const stored = getPluginConfig(namespace, pluginId);
  const configValues: Record<string, PluginConfigValue | ''> = {};
  const configStatus: Record<string, PluginConfigFieldStatus> = {};

  for (const field of fields) {
    const value = stored[field.key];
    const set = isConfigValueSet(field, value as PluginConfigValue | undefined);
    if (isSecretField(field)) {
      configValues[field.key] = '';
      configStatus[field.key] = {
        set,
        hint: set && typeof value === 'string' ? secretHint(value) : undefined,
      };
    } else {
      configValues[field.key] =
        value !== undefined
          ? (value as PluginConfigValue)
          : field.default !== undefined
            ? field.default
            : field.type === 'boolean'
              ? false
              : '';
      configStatus[field.key] = { set: set || field.default !== undefined };
    }
  }

  return {
    configSchema: fields,
    configValues,
    configStatus,
    configReady: isPluginConfigReady(namespace, pluginId, fields),
  };
}

function coerceValue(
  field: PluginConfigField,
  raw: unknown,
): PluginConfigValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  switch (field.type) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 1 || raw === '1') return true;
      if (raw === 'false' || raw === 0 || raw === '0') return false;
      return Boolean(raw);
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`配置项 ${field.key} 必须是数字`);
      }
      return n;
    }
    case 'select':
    case 'string':
    case 'password':
    case 'textarea':
    default:
      return String(raw);
  }
}

/**
 * 部分更新插件配置。
 * - 敏感字段空串 = 保留原值
 * - 非敏感空串 = 清空
 */
export function updatePluginConfig(
  namespace: string,
  pluginId: string,
  schema: readonly PluginConfigField[],
  patch: Record<string, unknown>,
): PluginConfigMap {
  const fields = normalizeConfigSchema(schema);
  if (!fields.length) {
    throw new Error('该插件未声明可配置参数');
  }
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const current = getPluginConfig(namespace, pluginId);
  const next: PluginConfigMap = { ...current };

  for (const [key, raw] of Object.entries(patch)) {
    const field = fieldMap.get(key);
    // 未知 key 忽略（兼容宽松 patch）
    if (!field) continue;

    if (raw === null) {
      delete next[key];
      continue;
    }

    if (isSecretField(field)) {
      if (raw === '' || raw === undefined) {
        // 保留原值
        continue;
      }
      const coerced = coerceValue(field, raw);
      if (coerced === undefined) continue;
      next[key] = coerced;
      continue;
    }

    if (raw === '' || raw === undefined) {
      delete next[key];
      continue;
    }
    const coerced = coerceValue(field, raw);
    if (coerced === undefined) {
      delete next[key];
      continue;
    }

    // select 必须在选项内
    if (field.type === 'select' && field.options?.length) {
      const s = String(coerced);
      if (!field.options.some((o) => o.value === s)) continue;
      next[key] = s;
      continue;
    }

    next[key] = coerced;
  }

  // 去掉 schema 外脏 key
  if (fields.length) {
    const allowed = new Set(fields.map((f) => f.key));
    for (const k of Object.keys(next)) {
      if (!allowed.has(k)) delete next[k];
    }
  }

  setPluginConfig(namespace, pluginId, next);
  return next;
}

export function resetPluginConfigStore(
  namespace: string,
  pluginId: string,
): void {
  resetPersistedConfig(namespace, pluginId);
}

export function createConfigAccessor(config: PluginConfigMap) {
  return {
    config,
    getConfig(key: string): PluginConfigValue | undefined {
      return config[key];
    },
  };
}
