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

  const copyText = async (value: string, okMsg?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onMessage?.(okMsg || t('settings.mcpCopied'));
    } catch {
      onError?.(t('settings.mcpCopyFailed'));
    }
  };

  const installCmd = pluginsDir
    ? `mkdir -p "${pluginsDir}"\ncp -R examples/source-plugin-echo "${pluginsDir}/echo"`
    : 'mkdir -p storage/plugins/source\ncp -R examples/source-plugin-echo storage/plugins/source/echo';

  const manifestExample = `{
  "id": "source.echo",
  "name": "Echo Test Plugin",
  "version": "0.1.0",
  "entry": "index.js",
  "apiVersion": 1,
  "description": "Demo source plugin",
  "riskLevel": "low",
  "capabilities": ["url"],
  "defaultEnabled": false,
  "permissions": []
}`;

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
            <span className="settings-card-hint">
              {t('settings.sourceInstallHint')}
            </span>
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

      <section className="settings-card settings-card-wide source-install-help">
        <div className="settings-block">
          <div className="settings-block-head">
            <h3>{t('settings.sourceInstallTitle')}</h3>
            <p>{t('settings.sourceInstallDesc')}</p>
          </div>

          <ol className="settings-steps source-install-steps">
            <li>{t('settings.sourceInstallStep1')}</li>
            <li>{t('settings.sourceInstallStep2')}</li>
            <li>{t('settings.sourceInstallStep3')}</li>
            <li>{t('settings.sourceInstallStep4')}</li>
          </ol>

          <details className="settings-prompt-details source-install-details">
            <summary>{t('settings.sourceInstallLayoutTitle')}</summary>
            <div className="source-install-panel">
              <p className="settings-inline-hint">
                {t('settings.sourceInstallLayoutDesc')}
              </p>
              <pre className="settings-code-block">{`storage/plugins/source/<plugin-dir>/
  plugin.json
  index.js`}</pre>
            </div>
          </details>

          <details className="settings-prompt-details source-install-details">
            <summary>{t('settings.sourceInstallManifestTitle')}</summary>
            <div className="source-install-panel">
              <p className="settings-inline-hint">
                {t('settings.sourceInstallManifestDesc')}
              </p>
              <div className="settings-prompt-actions">
                <button
                  type="button"
                  className="nl-btn nl-btn-secondary settings-prompt-copy-btn"
                  onClick={() =>
                    void copyText(
                      manifestExample,
                      t('settings.sourceInstallCopiedManifest'),
                    )
                  }
                >
                  {t('settings.sourceInstallCopyManifest')}
                </button>
              </div>
              <pre className="settings-code-block">{manifestExample}</pre>
            </div>
          </details>

          <details className="settings-prompt-details source-install-details">
            <summary>{t('settings.sourceInstallEchoTitle')}</summary>
            <div className="source-install-panel">
              <p className="settings-inline-hint">
                {t('settings.sourceInstallEchoDesc')}
              </p>
              <div className="settings-prompt-actions">
                <button
                  type="button"
                  className="nl-btn nl-btn-secondary settings-prompt-copy-btn"
                  onClick={() =>
                    void copyText(
                      installCmd,
                      t('settings.sourceInstallCopiedCmd'),
                    )
                  }
                >
                  {t('settings.sourceInstallCopyCmd')}
                </button>
              </div>
              <pre className="settings-code-block">{installCmd}</pre>
              <p className="settings-inline-hint">
                {t('settings.sourceInstallEchoUrlHint')}
              </p>
            </div>
          </details>

          <details className="settings-prompt-details source-install-details">
            <summary>{t('settings.sourceInstallRulesTitle')}</summary>
            <div className="source-install-panel">
              <ul className="source-install-rules">
                <li>{t('settings.sourceInstallRule1')}</li>
                <li>{t('settings.sourceInstallRule2')}</li>
                <li>{t('settings.sourceInstallRule3')}</li>
                <li>{t('settings.sourceInstallRule4')}</li>
              </ul>
            </div>
          </details>
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

                <div className="source-plugin-meta">
                  <span className={`source-risk-badge ${riskClass(plugin.riskLevel)}`}>
                    {riskLabel(plugin.riskLevel)}
                  </span>
                  <span className="source-meta-chip">
                    {originLabel(plugin.origin)}
                  </span>
                  <span className="source-meta-chip">
                    v{plugin.version || '—'}
                  </span>
                  <span
                    className={[
                      'source-meta-chip',
                      plugin.available ? 'is-ok' : 'is-bad',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {plugin.available
                      ? t('settings.sourceAvailable')
                      : t('settings.sourceUnavailable')}
                  </span>
                </div>

                {plugin.capabilities?.length ? (
                  <div className="source-plugin-tags">
                    {plugin.capabilities.map((cap) => (
                      <span key={cap} className="source-meta-chip">
                        {cap}
                      </span>
                    ))}
                  </div>
                ) : null}

                {plugin.permissions?.length ? (
                  <div className="source-plugin-tags">
                    {plugin.permissions.map((perm) => (
                      <span key={perm} className="source-meta-chip is-perm">
                        {perm}
                      </span>
                    ))}
                  </div>
                ) : null}

                {plugin.dirPath ? (
                  <p className="settings-inline-hint source-plugin-path">
                    {plugin.dirPath}
                  </p>
                ) : null}

                {plugin.loadError ? (
                  <p className="source-plugin-error" role="alert">
                    {t('settings.sourceLoadError')}: {plugin.loadError}
                  </p>
                ) : null}

                <div className="settings-card-actions">
                  <span className="settings-card-hint">
                    {plugin.origin === 'external'
                      ? t('settings.sourceExternalHint')
                      : t('settings.sourceBuiltinHint')}
                  </span>
                  <button
                    type="button"
                    className="nl-btn nl-btn-ghost"
                    disabled={busy}
                    onClick={() => void onReset(plugin)}
                  >
                    {t('settings.sourceResetBtn')}
                  </button>
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
