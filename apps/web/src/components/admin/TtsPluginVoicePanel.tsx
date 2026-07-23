import type { ChangeEvent } from 'react';
/**
 * TTS 插件音色面板通用渲染器
 *
 * 宿主不固定业务页面：只根据 plugin.voicePanel.fields 渲染。
 * 插件作者通过 meta.voicePanel 自定义布局与字段。
 */
import type { TtsMode, TtsOptions } from '../../types/job';
import type {
  AiPluginDescriptor,
  TtsVoicePanelField,
  TtsVoicePanelOption,
  TtsVoicePanelSpec,
  TtsVoicePanelWhen,
} from '../../api/plugins';
import { navigate } from '../../lib/router';
import { useI18n } from '../../i18n';

function matchWhen(when: TtsVoicePanelWhen | undefined, value: TtsOptions): boolean {
  if (!when) return true;
  if (when.mode !== undefined) {
    const mode = String(value.mode || 'default');
    const allowed = Array.isArray(when.mode) ? when.mode : [when.mode];
    if (!allowed.map(String).includes(mode)) return false;
  }
  return true;
}

function toggleTag(list: string[] | undefined, tag: string): string[] {
  const cur = list || [];
  return cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
}

function readPluginDefaultVoice(plugin?: AiPluginDescriptor | null): string {
  const values = plugin?.configValues;
  if (!values) return '';
  const key = String(plugin?.voiceConfigKey || '').trim();
  const tryKeys = [
    key,
    'referenceId',
    'reference_id',
    'defaultVoice',
    'voice',
  ].filter(Boolean);
  for (const k of tryKeys) {
    const raw = values[k];
    if (raw === undefined || raw === null || raw === '') continue;
    const s = String(raw).trim();
    if (s) return s;
  }
  return '';
}

function optionLabel(v: TtsVoicePanelOption): { name: string; meta?: string; title?: string } {
  const name = String(v.name || v.label || v.id);
  const meta = [v.language, v.gender && v.gender !== '-' ? v.gender : '']
    .filter(Boolean)
    .join(' · ');
  return {
    name,
    meta: meta || undefined,
    title: v.description || undefined,
  };
}

export function TtsPluginVoicePanel({
  value,
  onChange,
  plugin,
  panel,
}: {
  value: TtsOptions;
  onChange: (next: TtsOptions) => void;
  plugin?: AiPluginDescriptor | null;
  panel: TtsVoicePanelSpec;
}) {
  const { t } = useI18n();
  const pluginDefault = readPluginDefaultVoice(plugin);
  const effectiveVoice = String(value.voice || '').trim() || pluginDefault;

  const modesFromMeta = (plugin?.modes || []).map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
  }));
  const voicesFromMeta: TtsVoicePanelOption[] = (plugin?.voices || []).map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    description: v.description,
  }));

  const fields = Array.isArray(panel.fields) ? panel.fields : [];

  const renderField = (field: TtsVoicePanelField, index: number) => {
    if (!matchWhen(field.when, value)) return null;
    const key = `${field.type}-${index}`;

    if (field.type === 'info') {
      return (
        <div key={key} className="auth-tip">
          <span>{field.text}</span>
        </div>
      );
    }

    if (field.type === 'modeTabs') {
      const options =
        field.options && field.options.length ? field.options : modesFromMeta;
      if (!options.length) return null;
      return (
        <div key={key} className="tts-mode-grid">
          {options.map((m) => {
            const active = String(value.mode || 'default') === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={['tts-mode', active ? 'is-active' : ''].join(' ')}
                onClick={() => {
                  const nextMode = m.id as TtsMode;
                  if (nextMode === 'voicedesign') {
                    onChange({
                      ...value,
                      mode: 'voicedesign',
                      styleTags: undefined,
                    });
                  } else if (nextMode === 'voiceclone') {
                    onChange({
                      ...value,
                      mode: 'voiceclone',
                      voiceDesign: undefined,
                      styleTags: undefined,
                      // 清空预置音色名，避免当成参考音频
                      voice:
                        value.mode === 'voiceclone' ? value.voice : '',
                    });
                  } else {
                    onChange({
                      ...value,
                      mode: 'default',
                      voiceDesign: undefined,
                    });
                  }
                }}
              >
                <div className="title">{m.label}</div>
                {m.description ? <div className="desc">{m.description}</div> : null}
              </button>
            );
          })}
        </div>
      );
    }

    if (field.type === 'voiceGrid') {
      const options =
        field.options && field.options.length ? field.options : voicesFromMeta;
      if (!options.length) {
        return (
          <div key={key} className="auth-tip">
            <span>{t('tts.panelNoVoices')}</span>
          </div>
        );
      }
      const current = String(value.voice || '');
      return (
        <div key={key}>
          <div className="mb-1.5 text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.presetVoices')}
          </div>
          <div className="tts-voice-grid">
            {options.map((v) => {
              const ui = optionLabel(v);
              const active = current === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={['tts-voice', active ? 'is-active' : ''].join(' ')}
                  title={ui.title || `${ui.name}${ui.meta ? ` · ${ui.meta}` : ''}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      mode: (value.mode as TtsMode) || 'default',
                      voice: v.id,
                    })
                  }
                >
                  <div className="name">{ui.name}</div>
                  {ui.meta ? <div className="meta">{ui.meta}</div> : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === 'text' || field.type === 'textarea') {
      const bind = field.bind;
      const raw =
        bind === 'voiceDesign'
          ? value.voiceDesign || ''
          : value.voice || '';
      const common = {
        className: 'nl-input',
        value: raw,
        placeholder: field.placeholder,
        spellCheck: false as const,
        autoComplete: 'off' as const,
        onChange: (
          e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        ) => {
          const next = e.target.value;
          if (bind === 'voiceDesign') {
            onChange({ ...value, mode: 'voicedesign', voiceDesign: next });
          } else {
            onChange({ ...value, voice: next });
          }
        },
      };
      return (
        <div key={key}>
          <label className="mb-1.5 block text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {field.label}
          </label>
          {field.type === 'textarea' ? (
            <textarea {...common} rows={field.rows || 3} />
          ) : (
            <input type="text" {...common} />
          )}
          {field.description ? (
            <p className="mt-1 text-[var(--fs-xs)] text-[var(--text-3)]">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }

    if (field.type === 'select') {
      const bind = field.bind;
      const raw =
        bind === 'voiceDesign'
          ? value.voiceDesign || ''
          : value.voice || '';
      return (
        <div key={key}>
          <label className="mb-1.5 block text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {field.label}
          </label>
          <select
            className="nl-input"
            value={raw}
            onChange={(e) => {
              const next = e.target.value;
              if (bind === 'voiceDesign') {
                onChange({ ...value, mode: 'voicedesign', voiceDesign: next });
              } else {
                onChange({ ...value, voice: next });
              }
            }}
          >
            <option value="">{t('common.notFilled')}</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.description ? (
            <p className="mt-1 text-[var(--fs-xs)] text-[var(--text-3)]">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }

    if (field.type === 'tags') {
      const selected = value.styleTags || [];
      return (
        <div key={key} className="tts-sing-panel">
          <div className="mb-1.5 text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {field.label}
            {field.optional ? (
              <span className="ml-1 font-normal text-[var(--text-3)]">
                {t('common.optional')}
              </span>
            ) : null}
          </div>
          <div className="tts-tag-grid">
            {field.options.map((tag) => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={['tts-tag', active ? 'is-active' : ''].join(' ')}
                  onClick={() =>
                    onChange({
                      ...value,
                      styleTags: toggleTag(value.styleTags, tag),
                    })
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === 'effectiveSummary') {
      return (
        <div key={key} className="tts-ref-meta">
          <div className="tts-ref-meta-row">
            <span className="label">{t('tts.refEffective')}</span>
            <span className="value" title={effectiveVoice || t('tts.refMissing')}>
              {effectiveVoice || t('tts.refMissing')}
            </span>
          </div>
          <div className="tts-ref-meta-row">
            <span className="label">{t('tts.refPluginDefault')}</span>
            <span className="value">
              {pluginDefault || t('common.notFilled')}
            </span>
          </div>
        </div>
      );
    }

    if (field.type === 'actions') {
      const items = field.items || [];
      if (!items.length) return null;
      return (
        <div key={key} className="tts-ref-actions">
          {items.includes('usePluginDefault') && pluginDefault ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() =>
                onChange({
                  ...value,
                  mode: 'default',
                  voice: pluginDefault,
                  voiceDesign: undefined,
                })
              }
            >
              {t('tts.refUsePluginDefault')}
            </button>
          ) : null}
          {items.includes('clearOverride') && String(value.voice || '').trim() ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() =>
                onChange({
                  ...value,
                  mode: 'default',
                  voice: '',
                  voiceDesign: undefined,
                })
              }
            >
              {t('tts.refClearOverride')}
            </button>
          ) : null}
          {items.includes('openPluginSettings') ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'settings' })}
            >
              {t('tts.refOpenPluginSettings')}
            </button>
          ) : null}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="tts-plugin-panel space-y-2.5">
      {(panel.title || panel.description) && (
        <div className="settings-block-head is-bare">
          {panel.title ? <h3>{panel.title}</h3> : null}
          {panel.description ? <p>{panel.description}</p> : null}
        </div>
      )}
      {fields.map((f, i) => renderField(f, i))}
      {!fields.length && (
        <div className="auth-tip">
          <span>{t('tts.panelEmpty')}</span>
        </div>
      )}
    </div>
  );
}
