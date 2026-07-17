import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSourcePlugins,
  rescanSourcePlugins,
  resetSourcePluginEnabledApi,
  setSourcePluginEnabledApi,
  type SourcePluginDescriptor,
  type SourceRiskLevel,
} from '../../api/client';
import { useI18n } from '../../i18n';

function riskClass(level: SourceRiskLevel): string {
  if (level === 'low') return 'is-low';
  if (level === 'medium') return 'is-medium';
  return 'is-high';
}

/**
 * Source 插件管理：单卡片列表布局
 * - 顶部工具条：标题 + 刷新/扫描
 * - 插件行：名称/说明 + 开关
 * - 内置插件不展示「内置/低风险」
 * - 仅当启停被手动覆盖时显示「恢复默认」
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

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const res = await fetchSourcePlugins();
      setPluginsDir(res.pluginsDir || '');
      setPlugins(res.plugins || []);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setPlugins(res.plugins || []);
      setPluginsDir(res.scan?.pluginsDir || pluginsDir);
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
      setPlugins(res.plugins || []);
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
      setPlugins(res.plugins || []);
      onMessage?.(t('settings.sourceReset', { name: plugin.name }));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const riskLabel = (level: SourceRiskLevel) => {
    if (level === 'low') return t('settings.sourceRiskLow');
    if (level === 'medium') return t('settings.sourceRiskMedium');
    return t('settings.sourceRiskHigh');
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
        <div className="source-settings-dir" title={pluginsDir}>
          <span className="source-settings-dir-label">
            {t('settings.sourcePluginsDir')}
          </span>
          <code className="source-settings-dir-path">{pluginsDir}</code>
        </div>
      ) : null}

      {loading ? (
        <div className="source-settings-loading">{t('settings.sourceLoading')}</div>
      ) : sorted.length === 0 ? (
        <div className="source-settings-empty">{t('settings.sourceEmpty')}</div>
      ) : (
        <ul className="source-plugin-list" aria-label={t('settings.sourceHubTitle')}>
          {sorted.map((plugin) => {
            const busy = busyId === plugin.id;
            const toggleDisabled =
              busy || Boolean(plugin.loadError) || !plugin.available;
            const customized = plugin.enabled !== plugin.defaultEnabled;
            const showExternalMeta = plugin.origin !== 'builtin';

            return (
              <li
                key={plugin.id}
                className={[
                  'source-plugin-row',
                  plugin.enabled ? 'is-on' : '',
                  plugin.loadError ? 'is-error' : '',
                  !plugin.available ? 'is-unavailable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="source-plugin-row-main">
                  <div className="source-plugin-row-copy">
                    <div className="source-plugin-row-title">
                      <strong>{plugin.name}</strong>
                      {showExternalMeta ? (
                        <span
                          className={`source-risk-dot ${riskClass(plugin.riskLevel)}`}
                          title={riskLabel(plugin.riskLevel)}
                        >
                          {riskLabel(plugin.riskLevel)}
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
                  </div>

                  <div className="source-plugin-row-controls">
                    {customized && !plugin.loadError ? (
                      <button
                        type="button"
                        className="source-plugin-reset"
                        disabled={busy}
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
                        busy ? 'is-busy' : '',
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
