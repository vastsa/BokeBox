/**
 * Source 插件配置：schema 归一化、持久化读写、脱敏展示、必填校验
 */
import type {
  SourcePluginConfigField,
  SourcePluginConfigFieldStatus,
  SourcePluginConfigFieldType,
  SourcePluginConfigMap,
  SourcePluginConfigValue,
} from './types.js';
import {
  getSourcePluginConfigMap,
  setSourcePluginConfigMap,
} from './state.js';

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

function isFieldType(v: unknown): v is SourcePluginConfigFieldType {
  return (
    v === 'string' ||
    v === 'password' ||
    v === 'number' ||
    v === 'boolean' ||
    v === 'select'
  );
}

function isConfigValue(v: unknown): v is SourcePluginConfigValue {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function isSecretField(field: SourcePluginConfigField): boolean {
  if (typeof field.secret === 'boolean') return field.secret;
  return field.type === 'password';
}

/** 归一化 schema；非法项丢弃 */
export function normalizeConfigSchema(raw: unknown): SourcePluginConfigField[] {
  if (!Array.isArray(raw)) return [];
  const out: SourcePluginConfigField[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const key = String(obj.key || '').trim();
    const label = String(obj.label || '').trim();
    if (!key || !KEY_RE.test(key) || seen.has(key)) continue;
    if (!label) continue;
    if (!isFieldType(obj.type)) continue;

    const field: SourcePluginConfigField = {
      key,
      label,
      type: obj.type,
      description:
        typeof obj.description === 'string' ? obj.description : undefined,
      required: Boolean(obj.required),
      placeholder:
        typeof obj.placeholder === 'string' ? obj.placeholder : undefined,
      secret:
        typeof obj.secret === 'boolean'
          ? obj.secret
          : obj.type === 'password'
            ? true
            : false,
    };

    if (isConfigValue(obj.default)) {
      field.default = obj.default;
    }

    if (obj.type === 'select' && Array.isArray(obj.options)) {
      const options: Array<{ value: string; label: string }> = [];
      for (const opt of obj.options) {
        if (!opt || typeof opt !== 'object' || Array.isArray(opt)) continue;
        const o = opt as Record<string, unknown>;
        const value = String(o.value ?? '').trim();
        const olabel = String(o.label ?? value).trim();
        if (!value) continue;
        options.push({ value, label: olabel || value });
      }
      if (!options.length) continue;
      field.options = options;
    }

    seen.add(key);
    out.push(field);
  }

  return out;
}

/** 运行时 schema 优先，清单补齐未声明 key */
export function mergeConfigSchema(
  runtime?: readonly SourcePluginConfigField[] | null,
  manifest?: readonly SourcePluginConfigField[] | null,
): SourcePluginConfigField[] {
  const a = normalizeConfigSchema(runtime || []);
  const b = normalizeConfigSchema(manifest || []);
  if (!a.length) return b;
  if (!b.length) return a;
  const map = new Map<string, SourcePluginConfigField>();
  for (const f of b) map.set(f.key, f);
  for (const f of a) map.set(f.key, f);
  return [...map.values()];
}

function coerceValue(
  field: SourcePluginConfigField,
  raw: unknown,
): SourcePluginConfigValue | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (field.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === 'false' || raw === 0 || raw === '0') return false;
    return undefined;
  }

  if (field.type === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  // string / password / select
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return undefined;
}

/** 读取插件完整配置（明文，仅服务端） */
export function getSourcePluginConfig(pluginId: string): SourcePluginConfigMap {
  const all = getSourcePluginConfigMap();
  const raw = all[pluginId];
  if (!raw || typeof raw !== 'object') return {};
  const out: SourcePluginConfigMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isConfigValue(v)) out[k] = v;
  }
  return out;
}

/**
 * 合并写入插件配置。
 * - 未出现在 patch 的 key 保留
 * - 敏感字段：空字符串 / undefined 表示保留原值
 * - 显式 null 表示删除该 key
 */
export function updateSourcePluginConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[],
  patch: Record<string, unknown>,
): SourcePluginConfigMap {
  const fields = normalizeConfigSchema(schema);
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const current = getSourcePluginConfig(pluginId);
  const next: SourcePluginConfigMap = { ...current };

  for (const [key, raw] of Object.entries(patch || {})) {
    const field = fieldMap.get(key);
    if (!field) continue;

    if (raw === null) {
      delete next[key];
      continue;
    }

    // 敏感字段空串 = 不改
    if (isSecretField(field) && (raw === undefined || raw === '')) {
      continue;
    }

    const coerced = coerceValue(field, raw);
    if (coerced === undefined) {
      // 非敏感空串可清空
      if (!isSecretField(field) && raw === '') {
        delete next[key];
      }
      continue;
    }

    if (field.type === 'string' || field.type === 'password' || field.type === 'select') {
      const s = String(coerced);
      if (!s) {
        if (isSecretField(field)) continue;
        delete next[key];
        continue;
      }
      if (field.type === 'select' && field.options?.length) {
        const ok = field.options.some((o) => o.value === s);
        if (!ok) continue;
      }
      next[key] = s;
      continue;
    }

    next[key] = coerced;
  }

  // 去掉 schema 外的脏 key
  if (fields.length) {
    const allowed = new Set(fields.map((f) => f.key));
    for (const k of Object.keys(next)) {
      if (!allowed.has(k)) delete next[k];
    }
  }

  const all = getSourcePluginConfigMap();
  if (Object.keys(next).length === 0) {
    delete all[pluginId];
  } else {
    all[pluginId] = next;
  }
  setSourcePluginConfigMap(all);
  return next;
}

export function resetSourcePluginConfig(pluginId: string): void {
  const all = getSourcePluginConfigMap();
  if (!(pluginId in all)) return;
  delete all[pluginId];
  setSourcePluginConfigMap(all);
}

function secretHint(value: string): string {
  const s = value.trim();
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

export function isConfigValueSet(
  field: SourcePluginConfigField,
  value: SourcePluginConfigValue | undefined,
): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true; // boolean 含 false 也算已设置
}

/** 必填项是否齐全 */
export function isSourcePluginConfigReady(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): boolean {
  const fields = schema || [];
  if (!fields.length) return true;
  const config = getSourcePluginConfig(pluginId);
  for (const field of fields) {
    if (!field.required) continue;
    const value =
      config[field.key] !== undefined ? config[field.key] : field.default;
    if (!isConfigValueSet(field, value as SourcePluginConfigValue | undefined)) {
      return false;
    }
  }
  return true;
}

/** 供插件运行时使用的配置（含 default 回落） */
export function resolveRuntimeConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): SourcePluginConfigMap {
  const fields = schema || [];
  const stored = getSourcePluginConfig(pluginId);
  const out: SourcePluginConfigMap = { ...stored };
  for (const field of fields) {
    if (out[field.key] === undefined && field.default !== undefined) {
      out[field.key] = field.default;
    }
  }
  return out;
}

/** 列表 API 用：非敏感回显 + 敏感 set/hint */
export function toPublicPluginConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): {
  configSchema: SourcePluginConfigField[];
  configValues: Record<string, SourcePluginConfigValue | ''>;
  configStatus: Record<string, SourcePluginConfigFieldStatus>;
  configReady: boolean;
} {
  const fields = normalizeConfigSchema(schema || []);
  const stored = getSourcePluginConfig(pluginId);
  const configValues: Record<string, SourcePluginConfigValue | ''> = {};
  const configStatus: Record<string, SourcePluginConfigFieldStatus> = {};

  for (const field of fields) {
    const value = stored[field.key];
    const set = isConfigValueSet(field, value);
    if (isSecretField(field)) {
      configValues[field.key] = '';
      configStatus[field.key] = {
        set,
        hint: set && typeof value === 'string' ? secretHint(value) : undefined,
      };
    } else {
      configValues[field.key] =
        value !== undefined
          ? value
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
    configReady: isSourcePluginConfigReady(pluginId, fields),
  };
}

export function createConfigAccessor(config: SourcePluginConfigMap) {
  return {
    config,
    getConfig(key: string): SourcePluginConfigValue | undefined {
      return config[key];
    },
  };
}
