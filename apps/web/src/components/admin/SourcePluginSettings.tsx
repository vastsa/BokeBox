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
 * Source 插件管理：列表、风险标识、启停、热扫描
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
      onMessage?.(
        t('settings.sourceRescanDone', { loaded, failed }),
      );
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

  const originLabel = (origin: SourcePluginDescriptor['origin']) =>
    origin === 'builtin'
      ? t('settings.sourceOriginBuiltin')
      : t('settings.sourceOriginExternal');

  return (
    <div className="settings-stack source-plugin-settings">
      <section className="settings-card settings-card-wide">
        <div className="settings-block">
          <div className="settings-block-head">
            <h3>{t('settings.sourceHubTitle')}</h3>
            <p>{t('settings.sourceHubDesc')}</p>
          </div>

          <p className="settings-inline-hint">{t('settings.sourceRiskNote')}</p>

          <div className="settings-fields">
            <label className="auth-field">
              <span>{t('settings.sourcePluginsDir')}</span>
              <input
                type="text"
                readOnly
                value={pluginsDir || '—'}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="settings-card-actions">
            <span />
            <div className="settings-card-actions-right">
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
        </div>
      </section>

      {loading ? (
        <div className="auth-loading">{t('settings.sourceLoading')}</div>
      ) : sorted.length === 0 ? (
        <section className="settings-card settings-card-wide">
          <div className="settings-block">
            <p className="settings-inline-hint">{t('settings.sourceEmpty')}</p>
          </div>
        </section>
      ) : (
        sorted.map((plugin) => {
          const busy = busyId === plugin.id;
          const toggleDisabled =
            busy || Boolean(plugin.loadError) || !plugin.available;
          return (
            <section
              key={plugin.id}
              className={[
                'settings-card',
                'settings-card-wide',
                'source-plugin-card',
                plugin.loadError ? 'is-error' : '',
                plugin.enabled ? 'is-enabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="settings-block">
                <div className="source-plugin-card-head">
                  <div className="source-plugin-card-titles">
                    <div className="source-plugin-card-title-row">
                      <h3>{plugin.name}</h3>
                      <span className="source-plugin-id">{plugin.id}</span>
                    </div>
                    <p>{plugin.description || t('settings.sourceNoDesc')}</p>
                  </div>

                  <label
                    className={[
                      'upload-switch-row',
                      'source-plugin-switch',
                      busy ? 'is-busy' : '',
                      toggleDisabled ? 'is-locked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="upload-switch-copy">
                      <span className="title">
                        {plugin.enabled
                          ? t('settings.sourceStateOn')
                          : t('settings.sourceStateOff')}
                      </span>
                      <span className="desc">
                        {plugin.defaultEnabled
                          ? t('settings.sourceDefaultOn')
                          : t('settings.sourceDefaultOff')}
                      </span>
                    </span>
                    <span
                      className={[
                        'upload-switch',
                        plugin.enabled ? 'is-on' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <i />
                      <input
                        type="checkbox"
                        className="upload-switch-input"
                        checked={plugin.enabled}
                        disabled={toggleDisabled}
                        onChange={(e) =>
                          void onToggle(plugin, e.target.checked)
                        }
                        aria-label={t('settings.sourceToggleAria', {
                          name: plugin.name,
                        })}
                      />
                    </span>
                  </label>
                </div>

                {plugin.origin !== 'builtin' || !plugin.available || plugin.loadError ? (
                  <div className="source-plugin-meta">
                    {plugin.origin === 'builtin' ? null : (
                      <>
                        <span className={`source-risk-badge ${riskClass(plugin.riskLevel)}`}>
                          {riskLabel(plugin.riskLevel)}
                        </span>
                        <span className="source-meta-chip">
                          {originLabel(plugin.origin)}
                        </span>
                      </>
                    )}
                    {!plugin.available ? (
                      <span className="source-meta-chip is-bad">
                        {t('settings.sourceUnavailable')}
                      </span>
                    ) : null}
                  </div>
                ) : null}




                {plugin.loadError ? (
                  <p className="source-plugin-error" role="alert">
                    {t('settings.sourceLoadError')}: {plugin.loadError}
                  </p>
                ) : null}

                {plugin.loadError ? null : (
                  <div className="settings-card-actions">
                    <span />
                    <button
                      type="button"
                      className="nl-btn nl-btn-ghost"
                      disabled={busy}
                      onClick={() => void onReset(plugin)}
                    >
                      {t('settings.sourceResetBtn')}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
