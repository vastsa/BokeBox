import type {
  SourcePluginConfigField,
  SourcePluginConfigFieldStatus,
} from '../../api/client';
import {
  fieldSpan,
  isSecretField,
} from '../../features/settings/plugin-hub/pluginHubModel';
import { useI18n } from '../../i18n';

export type PluginConfigDraft = Record<string, string>;

type Labels = {
  required?: string;
  secretSet?: (hint: string) => string;
  secretUnset?: string;
  secretKeep?: string;
  selectPlaceholder?: string;
  on?: string;
  off?: string;
};

type Props = {
  schema: SourcePluginConfigField[];
  draft: PluginConfigDraft;
  status?: Record<string, SourcePluginConfigFieldStatus>;
  idPrefix: string;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
  /** 覆盖默认 i18n 文案（setup 可共用 settings 键） */
  labels?: Labels;
};

/**
 * 插件 configSchema 字段渲染（Setup / 插件中心共用）
 */
export function PluginConfigFields({
  schema,
  draft,
  status,
  idPrefix,
  disabled,
  onChange,
  labels,
}: Props) {
  const { t } = useI18n();

  const L = {
    required: labels?.required ?? t('settings.sourceConfigRequired'),
    secretSet:
      labels?.secretSet ??
      ((hint: string) =>
        t('settings.sourceConfigSecretSet', {
          hint: hint ? ` · ${hint}` : '',
        })),
    secretUnset: labels?.secretUnset ?? t('settings.sourceConfigSecretUnset'),
    secretKeep: labels?.secretKeep ?? t('settings.sourceConfigSecretKeep'),
    selectPlaceholder:
      labels?.selectPlaceholder ?? t('settings.pluginConfigSelectPlaceholder'),
    on: labels?.on ?? t('settings.pluginConfigOn'),
    off: labels?.off ?? t('settings.pluginConfigOff'),
  };

  const renderHead = (
    field: SourcePluginConfigField,
    opts?: { secret?: boolean; secretSet?: boolean; secretHint?: string },
  ) => (
    <div className="plugin-config-field-head">
      <div className="plugin-config-label-wrap">
        <span className="plugin-config-label">
          {field.label}
          {field.required ? (
            <span className="plugin-config-req" title={L.required}>
              *
            </span>
          ) : null}
        </span>
        {field.description ? (
          <span className="plugin-config-desc">{field.description}</span>
        ) : null}
      </div>
      {opts?.secret ? (
        <span
          className={[
            'plugin-config-secret-chip',
            opts.secretSet ? 'is-set' : 'is-unset',
          ].join(' ')}
        >
          {opts.secretSet
            ? L.secretSet(opts.secretHint || '')
            : L.secretUnset}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="plugin-config-grid">
      {schema.map((field) => {
        const value = draft[field.key] ?? '';
        const secret = isSecretField(field);
        const fieldStatus = status?.[field.key];
        const id = `${idPrefix}-${field.key}`;
        const span = fieldSpan(field);
        const shellClass = [
          'plugin-config-field',
          `is-${field.type || 'string'}`,
          span === 'full' ? 'is-span-full' : 'is-span-half',
          secret ? 'is-secret' : '',
        ]
          .filter(Boolean)
          .join(' ');

        if (field.type === 'boolean') {
          const on = value === 'true';
          return (
            <div className={shellClass} key={field.key}>
              {renderHead(field)}
              <label className="plugin-config-toggle" htmlFor={id}>
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(field.key, e.target.checked ? 'true' : 'false')
                  }
                />
                <i aria-hidden />
                <span>{on ? L.on : L.off}</span>
              </label>
            </div>
          );
        }

        if (field.type === 'select') {
          return (
            <div className={shellClass} key={field.key}>
              {renderHead(field)}
              <select
                id={id}
                className="plugin-config-control"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">{L.selectPlaceholder}</option>
                {(field.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (field.type === 'textarea') {
          return (
            <div className={shellClass} key={field.key}>
              {renderHead(field)}
              <textarea
                id={id}
                className="plugin-config-control plugin-config-textarea"
                rows={3}
                value={value}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            </div>
          );
        }

        const inputType =
          field.type === 'password' || secret
            ? 'password'
            : field.type === 'number'
              ? 'number'
              : 'text';

        return (
          <div className={shellClass} key={field.key}>
            {renderHead(field, {
              secret,
              secretSet: Boolean(fieldStatus?.set),
              secretHint: fieldStatus?.hint,
            })}
            <input
              id={id}
              type={inputType}
              className="plugin-config-control"
              value={value}
              disabled={disabled}
              placeholder={
                secret
                  ? fieldStatus?.set
                    ? L.secretKeep
                    : field.placeholder || ''
                  : field.placeholder || ''
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** 校验 schema 必填项（密钥空白视为未填） */
export function validatePluginConfigDraft(
  schema: SourcePluginConfigField[] | undefined,
  draft: PluginConfigDraft,
  status?: Record<string, SourcePluginConfigFieldStatus>,
): string | null {
  for (const field of schema || []) {
    if (!field.required) continue;
    const raw = draft[field.key];
    const secret = isSecretField(field);
    if (secret) {
      const hasNew = String(raw || '').trim().length > 0;
      const hasStored = Boolean(status?.[field.key]?.set);
      if (!hasNew && !hasStored) return field.label || field.key;
      continue;
    }
    if (field.type === 'boolean') continue;
    if (String(raw ?? '').trim() === '') return field.label || field.key;
  }
  return null;
}

/** 提交前：空密钥不发送，避免误清空 */
export function draftToConfigPatch(
  schema: SourcePluginConfigField[] | undefined,
  draft: PluginConfigDraft,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema || []) {
    const raw = draft[field.key];
    if (isSecretField(field)) {
      if (String(raw || '').trim() === '') continue;
      patch[field.key] = String(raw).trim();
      continue;
    }
    if (field.type === 'boolean') {
      patch[field.key] = raw === 'true';
      continue;
    }
    if (field.type === 'number') {
      if (raw === '' || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      patch[field.key] = n;
      continue;
    }
    patch[field.key] = raw === undefined ? '' : String(raw);
  }
  return patch;
}
