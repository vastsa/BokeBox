import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAiPlugins,
  fetchSourcePlugins,
  installAiPluginPackage,
  installSourcePluginPackage,
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
  uninstallAiPluginPackage,
  uninstallSourcePluginPackage,
  type AiPluginDescriptor,
  type SourcePluginConfigField,
  type SourcePluginDescriptor,
  type SourceRiskLevel,
} from '../../api/client';
import { useI18n } from '../../i18n';

import {
  buildDraft,
  fieldSpan,
  fromAi,
  fromSource,
  isSecretField,
  riskClass,
  type HubKind,
  type HubPlugin,
} from '../../features/settings/plugin-hub/pluginHubModel';

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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onUploadFile = async (file: File | null | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.zip')) {
      onError?.(t('settings.pluginUploadNeedZip'));
      return;
    }
    setUploading(true);
    onMessage?.(null);
    onError?.(null);
    try {
      const res =
        kind === 'source'
          ? await installSourcePluginPackage(file, true)
          : await installAiPluginPackage(kind, file, true);
      if (kind === 'source') {
        applyPlugins(((res.plugins || []) as SourcePluginDescriptor[]).map(fromSource));
      } else {
        applyPlugins(((res.plugins || []) as AiPluginDescriptor[]).map(fromAi));
      }
      setPluginsDir(res.installed?.scan?.pluginsDir || pluginsDir);
      onMessage?.(
        t('settings.pluginUploadDone', {
          name: res.installed?.name || res.installed?.pluginId || file.name,
          version: res.installed?.version || '-',
          action: res.installed?.replaced
            ? t('settings.pluginUploadReplaced')
            : t('settings.pluginUploadInstalled'),
        }),
      );
      if (res.installed?.pluginId) setExpandedId(res.installed.pluginId);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onUninstall = async (plugin: HubPlugin) => {
    if (plugin.origin === 'builtin') {
      onError?.(t('settings.pluginUninstallBuiltin'));
      return;
    }
    const ok = window.confirm(
      t('settings.pluginUninstallConfirm', { name: plugin.name }),
    );
    if (!ok) return;
    setBusyId(plugin.id);
    onMessage?.(null);
    onError?.(null);
    try {
      const res =
        kind === 'source'
          ? await uninstallSourcePluginPackage(plugin.id)
          : await uninstallAiPluginPackage(kind, plugin.id);
      if (kind === 'source') {
        applyPlugins(((res.plugins || []) as SourcePluginDescriptor[]).map(fromSource));
      } else {
        applyPlugins(((res.plugins || []) as AiPluginDescriptor[]).map(fromAi));
      }
      if (expandedId === plugin.id) setExpandedId(null);
      onMessage?.(t('settings.pluginUninstallDone', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
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


  const renderFieldHead = (
    field: SourcePluginConfigField,
    opts?: { secret?: boolean; secretSet?: boolean; secretHint?: string },
  ) => (
    <div className="plugin-config-field-head">
      <div className="plugin-config-label-wrap">
        <span className="plugin-config-label">
          {field.label}
          {field.required ? (
            <span className="plugin-config-req" title={t('settings.sourceConfigRequired')}>
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
            ? t('settings.sourceConfigSecretSet', {
                hint: opts.secretHint ? ` · ${opts.secretHint}` : '',
              })
            : t('settings.sourceConfigSecretUnset')}
        </span>
      ) : null}
    </div>
  );

  const renderField = (plugin: HubPlugin, field: SourcePluginConfigField) => {
    const draft = drafts[plugin.id] || {};
    const value = draft[field.key] ?? '';
    const secret = isSecretField(field);
    const status = plugin.configStatus?.[field.key];
    const id = `plugin-cfg-${kind}-${plugin.id}-${field.key}`;
    const span = fieldSpan(field);
    const disabled = savingConfigId === plugin.id;
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
          {renderFieldHead(field)}
          <label className="plugin-config-toggle" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={(e) =>
                setDraftValue(
                  plugin.id,
                  field.key,
                  e.target.checked ? 'true' : 'false',
                )
              }
            />
            <i aria-hidden />
            <span>{on ? t('settings.pluginConfigOn') : t('settings.pluginConfigOff')}</span>
          </label>
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <div className={shellClass} key={field.key}>
          {renderFieldHead(field)}
          <select
            id={id}
            className="plugin-config-control"
            value={value}
            disabled={disabled}
            onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
          >
            <option value="">{t('settings.pluginConfigSelectPlaceholder')}</option>
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
          {renderFieldHead(field)}
          <textarea
            id={id}
            className="plugin-config-control plugin-config-textarea"
            rows={3}
            value={value}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(e) => setDraftValue(plugin.id, field.key, e.target.value)}
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
        {renderFieldHead(field, {
          secret,
          secretSet: Boolean(status?.set),
          secretHint: status?.hint,
        })}
        <input
          id={id}
          type={inputType}
          className="plugin-config-control"
          value={value}
          disabled={disabled}
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
      </div>
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void onUploadFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="nl-btn nl-btn-secondary"
            onClick={() => void load()}
            disabled={loading || rescanning || uploading}
          >
            {t('common.refresh')}
          </button>
          <button
            type="button"
            className="nl-btn nl-btn-secondary"
            onClick={onUploadClick}
            disabled={loading || rescanning || uploading}
          >
            {uploading
              ? t('settings.pluginUploading')
              : t('settings.pluginUpload')}
          </button>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onRescan()}
            disabled={loading || rescanning || uploading}
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
                  <div className="source-plugin-row-header">
                    <div className="source-plugin-row-title-block">
                      <strong className="source-plugin-row-name">
                        {plugin.name}
                      </strong>
                      <div className="source-plugin-row-meta">
                        <span className="plugin-id-chip" title={plugin.id}>
                          {plugin.id}
                        </span>
                        <span className="plugin-origin-chip">
                          {plugin.origin === 'builtin'
                            ? t('settings.sourceOriginBuiltin')
                            : t('settings.sourceOriginExternal')}
                        </span>
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
                    </div>
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

                  <div className="source-plugin-row-actions">
                    {hasSchema ? (
                      <button
                        type="button"
                        className="source-plugin-action-btn is-primary"
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
                        className={[
                          'source-plugin-action-btn',
                          plugin.active ? 'is-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
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
                      className="source-plugin-action-btn is-muted"
                      disabled={busyId === plugin.id}
                      onClick={() => void onReset(plugin)}
                    >
                      {t('settings.sourceResetBtn')}
                    </button>
                    {plugin.origin === 'external' ? (
                      <button
                        type="button"
                        className="source-plugin-action-btn is-danger"
                        disabled={busyId === plugin.id || uploading}
                        onClick={() => void onUninstall(plugin)}
                      >
                        {t('settings.pluginUninstall')}
                      </button>
                    ) : null}
                  </div>
                </div>

                {expanded && hasSchema ? (
                  <div className="source-plugin-config-panel plugin-config-panel">
                    <div className="plugin-config-panel-head">
                      <strong>{t('settings.pluginConfigPanelTitle')}</strong>
                      <span>{t('settings.pluginConfigPanelHint')}</span>
                    </div>
                    <div className="plugin-config-grid">
                      {(plugin.configSchema || []).map((field) =>
                        renderField(plugin, field),
                      )}
                    </div>
                    <div className="plugin-config-actions">
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
