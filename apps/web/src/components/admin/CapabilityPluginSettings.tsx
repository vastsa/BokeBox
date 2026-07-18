import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAiPlugins,
  rescanAiPlugins,
  resetAiPluginConfigApi,
  resetAiPluginEnabledApi,
  saveAiPluginConfigApi,
  setAiPluginEnabledApi,
  type AiPluginDescriptor,
  type AiPluginKind,
  type SourcePluginConfigField,
  type SourceRiskLevel,
} from '../../api/client';
import { useI18n } from '../../i18n';

function riskClass(level: SourceRiskLevel): string {
  if (level === 'low') return 'is-low';
  if (level === 'medium') return 'is-medium';
  return 'is-high';
}

function isSecretField(field: SourcePluginConfigField): boolean {
  if (typeof field.secret === 'boolean') return field.secret;
  return field.type === 'password';
}

function buildDraft(plugin: AiPluginDescriptor): Record<string, string> {
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

/**
 * ASR / TTS 插件管理（与 Source 插件同一套 UI 机制）
 */
export function CapabilityPluginSettings({
  kind,
  onMessage,
  onError,
}: {
  kind: AiPluginKind;
  onMessage?: (msg: string | null) => void;
  onError?: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const [pluginsDir, setPluginsDir] = useState('');
  const [plugins, setPlugins] = useState<AiPluginDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);

  const titleKey = kind === 'asr' ? 'settings.asrHubTitle' : 'settings.ttsHubTitle';
  const descKey = kind === 'asr' ? 'settings.asrHubDesc' : 'settings.ttsHubDesc';
  const exampleDir = kind === 'asr' ? 'echo-asr' : 'echo-tts';
  const exampleCmd =
    kind === 'asr'
      ? 'cp -R examples/asr-plugin-echo storage/plugins/asr/echo-asr'
      : 'cp -R examples/tts-plugin-echo storage/plugins/tts/echo-tts';

  const applyPlugins = useCallback((list: AiPluginDescriptor[]) => {
    setPlugins(list);
    setDrafts((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const p of list) {
        next[p.id] = prev[p.id] ?? buildDraft(p);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const res = await fetchAiPlugins(kind);
      setPluginsDir(res.pluginsDir || '');
      applyPlugins(res.plugins || []);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyPlugins, kind, onError]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const sorted = useMemo(() => {
    const rank = (p: AiPluginDescriptor) => {
      if (p.active) return -1;
      if (p.origin === 'builtin') return 0;
      if (p.loadError) return 3;
      if (p.riskLevel === 'high') return 2;
      if (p.riskLevel === 'medium') return 1;
      return 0;
    };
    return [...plugins].sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [plugins]);

  const onRescan = async () => {
    setRescanning(true);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await rescanAiPlugins(kind);
      setPluginsDir(res.scan?.pluginsDir || pluginsDir);
      const list = res.plugins || [];
      setPlugins(list);
      setDrafts(Object.fromEntries(list.map((p) => [p.id, buildDraft(p)])));
      const loaded = res.scan?.loaded?.length || 0;
      const failed = res.scan?.failed?.length || 0;
      onMessage?.(t('settings.sourceRescanDone', { loaded, failed }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setRescanning(false);
    }
  };

  const onToggle = async (plugin: AiPluginDescriptor, enabled: boolean) => {
    if (plugin.loadError || !plugin.available) {
      // 允许对 available=false 但已加载的插件禁用；启用时才卡 config
      if (enabled && plugin.loadError) {
        onError?.(plugin.loadError || t('settings.sourceUnavailable'));
        return;
      }
    }
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await setAiPluginEnabledApi(kind, plugin.id, enabled);
      applyPlugins(res.plugins || []);
      onMessage?.(
        enabled
          ? t('settings.sourceEnabled', { name: plugin.name })
          : t('settings.sourceDisabled', { name: plugin.name }),
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onReset = async (plugin: AiPluginDescriptor) => {
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await resetAiPluginEnabledApi(kind, plugin.id);
      applyPlugins(res.plugins || []);
      onMessage?.(t('settings.sourceReset', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const setDraftValue = (pluginId: string, key: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [pluginId]: { ...(prev[pluginId] || {}), [key]: value },
    }));
  };

  const onSaveConfig = async (plugin: AiPluginDescriptor) => {
    const schema = plugin.configSchema || [];
    if (!schema.length) return;
    const draft = drafts[plugin.id] || {};
    const payload: Record<string, unknown> = {};
    for (const field of schema) {
      const raw = draft[field.key] ?? '';
      if (isSecretField(field)) {
        if (raw.trim() === '') continue;
        payload[field.key] = raw;
        continue;
      }
      if (field.type === 'boolean') {
        payload[field.key] = raw === 'true';
        continue;
      }
      if (field.type === 'number') {
        if (raw.trim() === '') {
          payload[field.key] = null;
        } else {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            onError?.(`${field.label}: invalid number`);
            return;
          }
          payload[field.key] = n;
        }
        continue;
      }
      payload[field.key] = raw;
    }

    setSavingConfigId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await saveAiPluginConfigApi(kind, plugin.id, payload);
      const updated = (res.plugins || []).find((p) => p.id === plugin.id);
      setDrafts((prev) => {
        const next = { ...prev };
        if (updated) next[plugin.id] = buildDraft(updated);
        return next;
      });
      applyPlugins(res.plugins || []);
      onMessage?.(t('settings.sourceConfigSaved', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfigId(null);
    }
  };

  const onResetConfig = async (plugin: AiPluginDescriptor) => {
    setSavingConfigId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await resetAiPluginConfigApi(kind, plugin.id);
      const updated = (res.plugins || []).find((p) => p.id === plugin.id);
      setDrafts((prev) => {
        const next = { ...prev };
        next[plugin.id] = updated ? buildDraft(updated) : {};
        return next;
      });
      applyPlugins(res.plugins || []);
      onMessage?.(t('settings.sourceConfigResetDone', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfigId(null);
    }
  };

  const riskLabel = (level: SourceRiskLevel) => {
    if (level === 'low') return t('settings.sourceRiskLow');
    if (level === 'medium') return t('settings.sourceRiskMedium');
    return t('settings.sourceRiskHigh');
  };

  const renderField = (plugin: AiPluginDescriptor, field: SourcePluginConfigField) => {
    const draft = drafts[plugin.id] || {};
    const value = draft[field.key] ?? '';
    const secret = isSecretField(field);
    const status = plugin.configStatus?.[field.key];
    const id = `${kind}-cfg-${plugin.id}-${field.key}`;

    if (field.type === 'boolean') {
      return (
        <label className="source-config-field" key={field.key} htmlFor={id}>
          <span className="source-config-label-row">
            <span className="source-config-label">{field.label}</span>
          </span>
          {field.description ? (
            <span className="source-config-desc">{field.description}</span>
          ) : null}
          <label className="source-config-check">
            <input
              id={id}
              type="checkbox"
              checked={value === 'true'}
              disabled={savingConfigId === plugin.id}
              onChange={(e) =>
                setDraftValue(plugin.id, field.key, e.target.checked ? 'true' : 'false')
              }
            />
            <span>{value === 'true' ? 'true' : 'false'}</span>
          </label>
        </label>
      );
    }

    if (field.type === 'select') {
      return (
        <label className="source-config-field" key={field.key} htmlFor={id}>
          <span className="source-config-label">{field.label}</span>
          <select
            id={id}
            className="nl-input"
            value={value}
            disabled={savingConfigId === plugin.id}
            onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
          >
            <option value="">—</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === 'textarea') {
      return (
        <label className="source-config-field" key={field.key} htmlFor={id}>
          <span className="source-config-label">{field.label}</span>
          <textarea
            id={id}
            className="nl-input"
            rows={3}
            value={value}
            placeholder={field.placeholder}
            disabled={savingConfigId === plugin.id}
            onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
          />
        </label>
      );
    }

    return (
      <label className="source-config-field" key={field.key} htmlFor={id}>
        <span className="source-config-label-row">
          <span className="source-config-label">{field.label}</span>
          {secret && status?.set ? (
            <span className="source-config-badge">
              {t('settings.sourceConfigSecretSet', { hint: status.hint || '••••' })}
            </span>
          ) : null}
        </span>
        {field.description ? (
          <span className="source-config-desc">{field.description}</span>
        ) : null}
        <input
          id={id}
          className="nl-input"
          type={secret ? 'password' : 'text'}
          value={value}
          placeholder={
            secret
              ? t('settings.sourceConfigSecretKeep')
              : field.placeholder || ''
          }
          disabled={savingConfigId === plugin.id}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
        />
      </label>
    );
  };

  return (
    <section className="settings-card settings-card-wide source-plugin-settings">
      <div className="settings-block">
        <div className="settings-block-head">
          <div>
            <h3>{t(titleKey)}</h3>
            <p className="settings-block-desc">{t(descKey)}</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={rescanning || loading}
            onClick={() => void onRescan()}
          >
            {rescanning ? t('settings.sourceRescanning') : t('settings.sourceRescan')}
          </button>
        </div>

        <div className="source-plugin-meta">
          <div className="source-plugin-dir">
            <span className="muted">{t('settings.sourcePluginsDir')}</span>
            <code>{pluginsDir || '—'}</code>
          </div>
          <p className="settings-inline-hint">{t('settings.sourceInstallSimple')}</p>
          <code className="source-install-cmd">{exampleCmd}</code>
          <p className="settings-inline-hint muted">
            {t('settings.aiPluginActiveHint')}
          </p>
        </div>

        {loading ? (
          <p className="muted">{t('settings.sourceLoading')}</p>
        ) : sorted.length === 0 ? (
          <p className="muted">{t('settings.sourceEmpty')}</p>
        ) : (
          <ul className="source-plugin-list">
            {sorted.map((plugin) => {
              const expanded = expandedId === plugin.id;
              const hasSchema = Boolean(plugin.configSchema?.length);
              return (
                <li
                  key={plugin.id}
                  className={[
                    'source-plugin-row',
                    plugin.loadError ? 'is-error' : '',
                    plugin.configReady === false ? 'is-config-missing' : '',
                    plugin.active ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="source-plugin-row-main">
                    <div className="source-plugin-row-copy">
                      <div className="source-plugin-row-title">
                        <strong>{plugin.name}</strong>
                        <span className="muted">{plugin.id}</span>
                        {plugin.active ? (
                          <span className="source-risk-pill is-low">
                            {t('settings.aiPluginActive')}
                          </span>
                        ) : null}
                        <span className={`source-risk-pill ${riskClass(plugin.riskLevel)}`}>
                          {riskLabel(plugin.riskLevel)}
                        </span>
                        <span className="source-origin-pill">
                          {plugin.origin === 'builtin'
                            ? t('settings.sourceOriginBuiltin')
                            : t('settings.sourceOriginExternal')}
                        </span>
                      </div>
                      <p className="source-plugin-row-desc">
                        {plugin.description || t('settings.sourceNoDesc')}
                      </p>
                      {plugin.loadError ? (
                        <p className="source-plugin-row-error">{plugin.loadError}</p>
                      ) : null}
                    </div>
                    <div className="source-plugin-row-controls">
                      {hasSchema ? (
                        <button
                          type="button"
                          className="source-plugin-config-btn"
                          onClick={() =>
                            setExpandedId(expanded ? null : plugin.id)
                          }
                        >
                          {expanded
                            ? t('settings.sourceConfigHide')
                            : t('settings.sourceConfigEdit')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="source-plugin-reset"
                        disabled={busyId === plugin.id}
                        onClick={() => void onReset(plugin)}
                      >
                        {t('settings.sourceResetBtn')}
                      </button>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={plugin.enabled}
                          disabled={busyId === plugin.id || Boolean(plugin.loadError)}
                          onChange={(e) => void onToggle(plugin, e.target.checked)}
                          aria-label={t('settings.sourceToggleAria', {
                            name: plugin.name,
                          })}
                        />
                        <span className="switch-slider" />
                      </label>
                    </div>
                  </div>

                  {expanded && hasSchema ? (
                    <div className="source-plugin-config-panel">
                      <div className="source-config-fields">
                        {(plugin.configSchema || []).map((field) =>
                          renderField(plugin, field),
                        )}
                      </div>
                      <div className="source-config-actions">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={savingConfigId === plugin.id}
                          onClick={() => void onSaveConfig(plugin)}
                        >
                          {savingConfigId === plugin.id
                            ? t('settings.sourceConfigSaving')
                            : t('settings.sourceConfigSave')}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={savingConfigId === plugin.id}
                          onClick={() => void onResetConfig(plugin)}
                        >
                          {t('settings.sourceConfigReset')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="settings-inline-hint muted">
          {kind === 'asr'
            ? t('settings.asrPluginDirHint', { dir: exampleDir })
            : t('settings.ttsPluginDirHint', { dir: exampleDir })}
        </p>
      </div>
    </section>
  );
}
