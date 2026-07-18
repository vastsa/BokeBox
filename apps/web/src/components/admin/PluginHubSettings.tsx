import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAiPlugins,
  fetchSourcePlugins,
  rescanAiPlugins,
  rescanSourcePlugins,
  resetAiPluginConfigApi,
  resetAiPluginEnabledApi,
  resetSourcePluginConfigApi,
  resetSourcePluginEnabledApi,
  saveAiPluginConfigApi,
  saveSourcePluginConfigApi,
  saveAiSettings,
  setAiPluginEnabledApi,
  setSourcePluginEnabledApi,
  type AiPluginDescriptor,
  type AiPluginKind,
  type SourcePluginConfigField,
  type SourcePluginDescriptor,
  type SourceRiskLevel,
} from '../../api/client';
import { useI18n } from '../../i18n';

type HubKind = 'source' | AiPluginKind;

type HubPlugin = {
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

function riskClass(level: SourceRiskLevel): string {
  if (level === 'low') return 'is-low';
  if (level === 'medium') return 'is-medium';
  return 'is-high';
}

function isSecretField(field: SourcePluginConfigField): boolean {
  if (typeof field.secret === 'boolean') return field.secret;
  return field.type === 'password';
}

function buildDraft(plugin: HubPlugin): Record<string, string> {
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

function fromSource(p: SourcePluginDescriptor): HubPlugin {
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

function fromAi(p: AiPluginDescriptor): HubPlugin {
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

/**
 * 统一插件中心：Source / ASR / TTS 同一套列表样式与交互
 */
export function PluginHubSettings({
  onMessage,
  onError,
}: {
  onMessage?: (msg: string | null) => void;
  onError?: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<HubKind>('source');
  const [pluginsDir, setPluginsDir] = useState('');
  const [plugins, setPlugins] = useState<HubPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);

  const kindMeta = useMemo(() => {
    if (kind === 'source') {
      return {
        title: t('settings.pluginKindSource'),
        desc: t('settings.pluginKindSourceDesc'),
        empty: t('settings.sourceEmpty'),
      };
    }
    if (kind === 'asr') {
      return {
        title: t('settings.pluginKindAsr'),
        desc: t('settings.pluginKindAsrDesc'),
        empty: t('settings.pluginEmptyAsr'),
      };
    }
    return {
      title: t('settings.pluginKindTts'),
      desc: t('settings.pluginKindTtsDesc'),
      empty: t('settings.pluginEmptyTts'),
    };
  }, [kind, t]);

  const applyPlugins = useCallback((list: HubPlugin[]) => {
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
      if (kind === 'source') {
        const res = await fetchSourcePlugins();
        setPluginsDir(res.pluginsDir || '');
        applyPlugins((res.plugins || []).map(fromSource));
      } else {
        const res = await fetchAiPlugins(kind);
        setPluginsDir(res.pluginsDir || '');
        applyPlugins((res.plugins || []).map(fromAi));
      }
      setExpandedId(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyPlugins, kind, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    const rank = (p: HubPlugin) => {
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
      if (kind === 'source') {
        const res = await rescanSourcePlugins();
        setPluginsDir(res.scan?.pluginsDir || pluginsDir);
        const list = (res.plugins || []).map(fromSource);
        setPlugins(list);
        setDrafts(Object.fromEntries(list.map((p) => [p.id, buildDraft(p)])));
        onMessage?.(
          t('settings.sourceRescanDone', {
            loaded: res.scan?.loaded?.length || 0,
            failed: res.scan?.failed?.length || 0,
          }),
        );
      } else {
        const res = await rescanAiPlugins(kind);
        setPluginsDir(res.scan?.pluginsDir || pluginsDir);
        const list = (res.plugins || []).map(fromAi);
        setPlugins(list);
        setDrafts(Object.fromEntries(list.map((p) => [p.id, buildDraft(p)])));
        onMessage?.(
          t('settings.sourceRescanDone', {
            loaded: res.scan?.loaded?.length || 0,
            failed: res.scan?.failed?.length || 0,
          }),
        );
      }
      setExpandedId(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setRescanning(false);
    }
  };

  const onToggle = async (plugin: HubPlugin, enabled: boolean) => {
    if (enabled && plugin.loadError) {
      onError?.(plugin.loadError || t('settings.sourceUnavailable'));
      return;
    }
    // 停用当前激活的 ASR/TTS：提示用户需改选提供方，否则任务会直接失败
    if (
      !enabled &&
      plugin.active &&
      (kind === 'asr' || kind === 'tts')
    ) {
      const ok = window.confirm(
        t('settings.pluginDisableActiveConfirm', { name: plugin.name }),
      );
      if (!ok) return;
    }
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      if (kind === 'source') {
        const res = await setSourcePluginEnabledApi(plugin.id, enabled);
        applyPlugins((res.plugins || []).map(fromSource));
      } else {
        const res = await setAiPluginEnabledApi(kind, plugin.id, enabled);
        applyPlugins((res.plugins || []).map(fromAi));
      }
      onMessage?.(
        enabled
          ? t('settings.sourceEnabled', { name: plugin.name })
          : plugin.active && (kind === 'asr' || kind === 'tts')
            ? t('settings.pluginDisabledActiveWarn', { name: plugin.name })
            : t('settings.sourceDisabled', { name: plugin.name }),
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onSetActive = async (plugin: HubPlugin) => {
    if (kind !== 'asr' && kind !== 'tts') return;
    if (plugin.loadError || !plugin.enabled) {
      onError?.(t('settings.pluginSetActiveNeedEnabled'));
      return;
    }
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      await saveAiSettings(
        kind === 'asr'
          ? { asrProvider: plugin.id }
          : { ttsProvider: plugin.id },
      );
      // 刷新列表以更新 active 标记
      await load();
      onMessage?.(t('settings.pluginSetActiveDone', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onReset = async (plugin: HubPlugin) => {
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      if (kind === 'source') {
        const res = await resetSourcePluginEnabledApi(plugin.id);
        applyPlugins((res.plugins || []).map(fromSource));
      } else {
        const res = await resetAiPluginEnabledApi(kind, plugin.id);
        applyPlugins((res.plugins || []).map(fromAi));
      }
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

  const onSaveConfig = async (plugin: HubPlugin) => {
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
      if (kind === 'source') {
        const res = await saveSourcePluginConfigApi(plugin.id, payload);
        const list = (res.plugins || []).map(fromSource);
        const updated = list.find((p) => p.id === plugin.id);
        setDrafts((prev) => {
          const next = { ...prev };
          if (updated) next[plugin.id] = buildDraft(updated);
          return next;
        });
        applyPlugins(list);
      } else {
        const res = await saveAiPluginConfigApi(kind, plugin.id, payload);
        const list = (res.plugins || []).map(fromAi);
        const updated = list.find((p) => p.id === plugin.id);
        setDrafts((prev) => {
          const next = { ...prev };
          if (updated) next[plugin.id] = buildDraft(updated);
          return next;
        });
        applyPlugins(list);
      }
      onMessage?.(t('settings.sourceConfigSaved', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfigId(null);
    }
  };

  const onResetConfig = async (plugin: HubPlugin) => {
    setSavingConfigId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      if (kind === 'source') {
        const res = await resetSourcePluginConfigApi(plugin.id);
        const list = (res.plugins || []).map(fromSource);
        const updated = list.find((p) => p.id === plugin.id);
        setDrafts((prev) => {
          const next = { ...prev };
          next[plugin.id] = updated ? buildDraft(updated) : {};
          return next;
        });
        applyPlugins(list);
      } else {
        const res = await resetAiPluginConfigApi(kind, plugin.id);
        const list = (res.plugins || []).map(fromAi);
        const updated = list.find((p) => p.id === plugin.id);
        setDrafts((prev) => {
          const next = { ...prev };
          next[plugin.id] = updated ? buildDraft(updated) : {};
          return next;
        });
        applyPlugins(list);
      }
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

  const renderField = (plugin: HubPlugin, field: SourcePluginConfigField) => {
    const draft = drafts[plugin.id] || {};
    const value = draft[field.key] ?? '';
    const secret = isSecretField(field);
    const status = plugin.configStatus?.[field.key];
    const id = `plugin-cfg-${kind}-${plugin.id}-${field.key}`;

    if (field.type === 'boolean') {
      return (
        <label className="source-config-field" key={field.key} htmlFor={id}>
          <span className="source-config-label-row">
            <span className="source-config-label">{field.label}</span>
            <span className="source-config-badge">
              {field.required
                ? t('settings.sourceConfigRequired')
                : t('settings.sourceConfigOptional')}
            </span>
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
                setDraftValue(
                  plugin.id,
                  field.key,
                  e.target.checked ? 'true' : 'false',
                )
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
          <span className="source-config-label-row">
            <span className="source-config-label">{field.label}</span>
            <span className="source-config-badge">
              {field.required
                ? t('settings.sourceConfigRequired')
                : t('settings.sourceConfigOptional')}
            </span>
          </span>
          {field.description ? (
            <span className="source-config-desc">{field.description}</span>
          ) : null}
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
          <span className="source-config-label-row">
            <span className="source-config-label">{field.label}</span>
            <span className="source-config-badge">
              {field.required
                ? t('settings.sourceConfigRequired')
                : t('settings.sourceConfigOptional')}
            </span>
          </span>
          {field.description ? (
            <span className="source-config-desc">{field.description}</span>
          ) : null}
          <textarea
            id={id}
            className="nl-input source-config-textarea"
            rows={3}
            value={value}
            placeholder={field.placeholder}
            disabled={savingConfigId === plugin.id}
            onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
          />
        </label>
      );
    }

    const inputType =
      field.type === 'password' || secret
        ? 'password'
        : field.type === 'number'
          ? 'number'
          : 'text';

    return (
      <label className="source-config-field" key={field.key} htmlFor={id}>
        <span className="source-config-label-row">
          <span className="source-config-label">{field.label}</span>
          <span className="source-config-badge">
            {field.required
              ? t('settings.sourceConfigRequired')
              : t('settings.sourceConfigOptional')}
          </span>
        </span>
        {field.description ? (
          <span className="source-config-desc">{field.description}</span>
        ) : null}
        <input
          id={id}
          type={inputType}
          className="nl-input"
          value={value}
          disabled={savingConfigId === plugin.id}
          placeholder={
            secret
              ? status?.set
                ? t('settings.sourceConfigSecretKeep')
                : field.placeholder || ''
              : field.placeholder || ''
          }
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
        />
        {secret ? (
          <span className="source-config-secret-status">
            {status?.set
              ? t('settings.sourceConfigSecretSet', {
                  hint: status.hint ? `· ${status.hint}` : '',
                })
              : t('settings.sourceConfigSecretUnset')}
          </span>
        ) : null}
      </label>
    );
  };

  const kinds: Array<{ id: HubKind; label: string }> = [
    { id: 'source', label: t('settings.pluginTabSource') },
    { id: 'asr', label: t('settings.pluginTabAsr') },
    { id: 'tts', label: t('settings.pluginTabTts') },
  ];

  return (
    <section className="settings-card settings-card-wide source-plugin-settings plugin-hub">
      <div className="source-settings-head">
        <div className="source-settings-head-copy">
          <h3>{t('settings.pluginHubTitle')}</h3>
          <p>{t('settings.pluginHubDesc')}</p>
        </div>
        <div className="source-settings-head-actions">
          <button
            type="button"
            className="nl-btn nl-btn-secondary"
            onClick={() => void load()}
            disabled={loading || rescanning}
          >
            {t('common.refresh')}
          </button>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onRescan()}
            disabled={loading || rescanning}
          >
            {rescanning
              ? t('settings.sourceRescanning')
              : t('settings.sourceRescan')}
          </button>
        </div>
      </div>

      <div className="plugin-hub-tabs" role="tablist" aria-label={t('settings.pluginHubTitle')}>
        {kinds.map((item) => {
          const active = kind === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={['plugin-hub-tab', active ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (item.id !== kind) {
                  setKind(item.id);
                  setLoading(true);
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="plugin-hub-kind-meta">
        <div className="plugin-hub-kind-copy">
          <strong>{kindMeta.title}</strong>
          <span>{kindMeta.desc}</span>
        </div>
        {pluginsDir ? (
          <div className="source-settings-dir plugin-hub-dir">
            <span className="source-settings-dir-label">
              {t('settings.sourcePluginsDir')}
            </span>
            <code className="source-settings-dir-path" title={pluginsDir}>
              {pluginsDir}
            </code>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="source-settings-loading">{t('settings.sourceLoading')}</div>
      ) : sorted.length === 0 ? (
        <div className="source-settings-empty">{kindMeta.empty}</div>
      ) : (
        <ul className="source-plugin-list" aria-label={kindMeta.title}>
          {sorted.map((plugin) => {
            const toggleDisabled =
              Boolean(plugin.loadError) || busyId === plugin.id;
            const hasSchema = Boolean(plugin.configSchema?.length);
            const expanded = expandedId === plugin.id;
            const showRisk =
              plugin.origin !== 'builtin' || plugin.riskLevel !== 'low';

            return (
              <li
                key={`${kind}:${plugin.id}`}
                className={[
                  'source-plugin-row',
                  plugin.loadError ? 'is-error' : '',
                  hasSchema && plugin.configReady === false
                    ? 'is-config-missing'
                    : '',
                  plugin.active ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="source-plugin-row-main">
                  <div className="source-plugin-row-copy">
                    <div className="source-plugin-row-title">
                      <strong>{plugin.name}</strong>
                      <span className="plugin-id-chip">{plugin.id}</span>
                      {plugin.active ? (
                        <span className="source-config-dot is-ready">
                          {t('settings.aiPluginActive')}
                        </span>
                      ) : null}
                      {showRisk ? (
                        <span
                          className={`source-risk-dot ${riskClass(plugin.riskLevel)}`}
                        >
                          {riskLabel(plugin.riskLevel)}
                        </span>
                      ) : null}
                      <span className="plugin-origin-chip">
                        {plugin.origin === 'builtin'
                          ? t('settings.sourceOriginBuiltin')
                          : t('settings.sourceOriginExternal')}
                      </span>
                      {hasSchema ? (
                        <span
                          className={[
                            'source-config-dot',
                            plugin.configReady ? 'is-ready' : 'is-missing',
                          ].join(' ')}
                        >
                          {plugin.configReady
                            ? t('settings.sourceConfigReady')
                            : t('settings.sourceConfigMissing')}
                        </span>
                      ) : null}
                    </div>
                    <p className="source-plugin-row-desc">
                      {plugin.description || t('settings.sourceNoDesc')}
                    </p>
                    {plugin.loadError ? (
                      <p className="source-plugin-row-error" role="alert">
                        {plugin.loadError}
                      </p>
                    ) : null}
                    {hasSchema && plugin.configReady === false ? (
                      <p className="source-plugin-row-config-hint">
                        {t('settings.sourceConfigNeedBeforeUse')}
                      </p>
                    ) : null}
                  </div>

                  <div className="source-plugin-row-controls">
                    {hasSchema ? (
                      <button
                        type="button"
                        className="source-plugin-config-btn"
                        disabled={Boolean(plugin.loadError)}
                        onClick={() =>
                          setExpandedId(expanded ? null : plugin.id)
                        }
                      >
                        {expanded
                          ? t('settings.sourceConfigHide')
                          : t('settings.sourceConfigEdit')}
                      </button>
                    ) : null}
                    {kind === 'asr' || kind === 'tts' ? (
                      <button
                        type="button"
                        className="source-plugin-config-btn"
                        disabled={
                          busyId === plugin.id ||
                          Boolean(plugin.loadError) ||
                          !plugin.enabled ||
                          Boolean(plugin.active)
                        }
                        onClick={() => void onSetActive(plugin)}
                      >
                        {plugin.active
                          ? t('settings.aiPluginActive')
                          : t('settings.pluginSetActive')}
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
                    <label
                      className={[
                        'source-switch',
                        plugin.enabled ? 'is-on' : '',
                        toggleDisabled ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        disabled={toggleDisabled}
                        onChange={(e) => void onToggle(plugin, e.target.checked)}
                        aria-label={t('settings.sourceToggleAria', {
                          name: plugin.name,
                        })}
                      />
                      <i />
                    </label>
                  </div>
                </div>

                {expanded && hasSchema ? (
                  <div className="source-plugin-config-panel">
                    <div className="source-plugin-config-grid">
                      {(plugin.configSchema || []).map((field) =>
                        renderField(plugin, field),
                      )}
                    </div>
                    <div className="source-plugin-config-actions">
                      <button
                        type="button"
                        className="nl-btn nl-btn-primary"
                        disabled={savingConfigId === plugin.id}
                        onClick={() => void onSaveConfig(plugin)}
                      >
                        {savingConfigId === plugin.id
                          ? t('settings.sourceConfigSaving')
                          : t('settings.sourceConfigSave')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn nl-btn-secondary"
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
    </section>
  );
}
