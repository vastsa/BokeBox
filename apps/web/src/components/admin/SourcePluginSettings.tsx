import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSourcePlugins,
  rescanSourcePlugins,
  resetSourcePluginConfigApi,
  resetSourcePluginEnabledApi,
  saveSourcePluginConfigApi,
  setSourcePluginEnabledApi,
  type SourcePluginConfigField,
  type SourcePluginDescriptor,
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

function buildDraft(plugin: SourcePluginDescriptor): Record<string, string> {
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
 * Source 插件管理：列表 + 可展开参数配置
 */
export function SourcePluginSettings({
  onMessage,
  onError,
}: {
  onMessage?: (msg: string | null) => void;
  onError?: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const [pluginsDir, setPluginsDir] = useState('');
  const [plugins, setPlugins] = useState<SourcePluginDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);

  const applyPlugins = useCallback((list: SourcePluginDescriptor[]) => {
    setPlugins(list);
    setDrafts((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const p of list) {
        // 已有本地草稿优先（展开编辑中不丢）
        next[p.id] = prev[p.id] ?? buildDraft(p);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const res = await fetchSourcePlugins();
      setPluginsDir(res.pluginsDir || '');
      applyPlugins(res.plugins || []);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyPlugins, onError]);

  useEffect(() => {
    void load();
    // 仅挂载时拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const rank = (p: SourcePluginDescriptor) => {
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
      const res = await rescanSourcePlugins();
      setPluginsDir(res.scan?.pluginsDir || pluginsDir);
      // rescan 后以服务端为准重建草稿（避免与 applyPlugins 的 prev 合并竞态）
      const list = res.plugins || [];
      setPlugins(list);
      setDrafts(
        Object.fromEntries(list.map((p) => [p.id, buildDraft(p)])),
      );
      const loaded = res.scan?.loaded?.length || 0;
      const failed = res.scan?.failed?.length || 0;
      onMessage?.(t('settings.sourceRescanDone', { loaded, failed }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setRescanning(false);
    }
  };

  const onToggle = async (plugin: SourcePluginDescriptor, enabled: boolean) => {
    if (plugin.loadError || !plugin.available) {
      onError?.(plugin.loadError || t('settings.sourceUnavailable'));
      return;
    }
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await setSourcePluginEnabledApi(plugin.id, enabled);
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

  const onReset = async (plugin: SourcePluginDescriptor) => {
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await resetSourcePluginEnabledApi(plugin.id);
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
      [pluginId]: {
        ...(prev[pluginId] || {}),
        [key]: value,
      },
    }));
  };

  const onSaveConfig = async (plugin: SourcePluginDescriptor) => {
    const schema = plugin.configSchema || [];
    if (!schema.length) return;
    const draft = drafts[plugin.id] || {};
    const payload: Record<string, unknown> = {};

    for (const field of schema) {
      const raw = draft[field.key] ?? '';
      if (isSecretField(field)) {
        // 空串 = 保留原值
        if (raw.trim()) payload[field.key] = raw;
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
      const res = await saveSourcePluginConfigApi(plugin.id, payload);
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

  const onResetConfig = async (plugin: SourcePluginDescriptor) => {
    setSavingConfigId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res = await resetSourcePluginConfigApi(plugin.id);
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

  const renderField = (
    plugin: SourcePluginDescriptor,
    field: SourcePluginConfigField,
  ) => {
    const draft = drafts[plugin.id] || {};
    const value = draft[field.key] ?? '';
    const secret = isSecretField(field);
    const status = plugin.configStatus?.[field.key];
    const id = `source-cfg-${plugin.id}-${field.key}`;

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

  return (
    <section className="settings-card settings-card-wide source-plugin-settings">
      <div className="source-settings-head">
        <div className="source-settings-head-copy">
          <h3>{t('settings.sourceHubTitle')}</h3>
          <p>{t('settings.sourceHubDesc')}</p>
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

      {pluginsDir ? (
        <div className="source-settings-dir">
          <span className="source-settings-dir-label">
            {t('settings.sourcePluginsDir')}
          </span>
          <code className="source-settings-dir-path" title={pluginsDir}>
            {pluginsDir}
          </code>
        </div>
      ) : null}

      {loading ? (
        <div className="source-settings-loading">{t('settings.sourceLoading')}</div>
      ) : sorted.length === 0 ? (
        <div className="source-settings-empty">{t('settings.sourceEmpty')}</div>
      ) : (
        <ul className="source-plugin-list" aria-label={t('settings.sourceHubTitle')}>
          {sorted.map((plugin) => {
            const toggleDisabled =
              Boolean(plugin.loadError) ||
              !plugin.available ||
              busyId === plugin.id;
            const hasSchema = Boolean(plugin.configSchema?.length);
            const expanded = expandedId === plugin.id;
            const showRisk =
              plugin.origin !== 'builtin' || plugin.riskLevel !== 'low';
            const isOverride =
              plugin.enabled !== plugin.defaultEnabled && !plugin.loadError;

            return (
              <li
                key={plugin.id}
                className={[
                  'source-plugin-row',
                  plugin.loadError ? 'is-error' : '',
                  hasSchema && plugin.configReady === false ? 'is-config-missing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="source-plugin-row-main">
                  <div className="source-plugin-row-copy">
                    <div className="source-plugin-row-title">
                      <strong>{plugin.name}</strong>
                      {showRisk ? (
                        <span
                          className={`source-risk-dot ${riskClass(plugin.riskLevel)}`}
                        >
                          {riskLabel(plugin.riskLevel)}
                        </span>
                      ) : null}
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
                          setExpandedId((cur) =>
                            cur === plugin.id ? null : plugin.id,
                          )
                        }
                      >
                        {expanded
                          ? t('settings.sourceConfigHide')
                          : t('settings.sourceConfigEdit')}
                      </button>
                    ) : null}
                    {isOverride ? (
                      <button
                        type="button"
                        className="source-plugin-reset"
                        disabled={busyId === plugin.id}
                        onClick={() => void onReset(plugin)}
                      >
                        {t('settings.sourceResetBtn')}
                      </button>
                    ) : null}
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
                      <i aria-hidden />
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
                        className="nl-btn nl-btn-secondary"
                        disabled={savingConfigId === plugin.id}
                        onClick={() => void onResetConfig(plugin)}
                      >
                        {t('settings.sourceConfigReset')}
                      </button>
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
