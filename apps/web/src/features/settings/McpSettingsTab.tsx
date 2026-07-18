import { useI18n } from '../../i18n';
import type { McpInstallBundle, McpStatus } from '../../api/client';
import { PageLoader } from '../../components/ui/PageLoader';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

type Props = {
  active: boolean;
  mcpStatus: McpStatus | null;
  mcpInstall: McpInstallBundle | null;
  mcpLoading: boolean;
  mcpBusy: boolean;
  mcpShowToken: boolean;
  mcpBaseUrl: string;
  mcpActiveClient: 'cursor' | 'claude' | 'codex';
  onBaseUrlChange: (value: string) => void;
  onShowTokenToggle: () => void;
  onActiveClientChange: (id: 'cursor' | 'claude' | 'codex') => void;
  onReloadInstall: () => void;
  onRegenerate: () => void;
  copyText: (text: string, okMsg?: string) => void | Promise<void>;
};

export function McpSettingsTab({
  active,
  mcpStatus,
  mcpInstall,
  mcpLoading,
  mcpBusy,
  mcpShowToken,
  mcpBaseUrl,
  mcpActiveClient,
  onBaseUrlChange,
  onShowTokenToggle,
  onActiveClientChange,
  onReloadInstall,
  onRegenerate,
  copyText,
}: Props) {
  const { t } = useI18n();
  return (
                <SettingsPanel id="mcp" active={active}>
                  <div className="settings-stack">

                    <SettingsCard className="settings-card-mcp-prompt">
                      <SettingsBlock
                        title={t('settings.mcpAiPromptTitle')}
                        desc={t('settings.mcpAiPromptDesc')}
                      >
                        <p className="settings-inline-hint">
                          {t('settings.mcpAiPromptHint')}
                        </p>
                        <div className="settings-prompt-actions">
                          <button
                            type="button"
                            className="nl-btn nl-btn-primary settings-prompt-copy-btn"
                            onClick={() =>
                              void copyText(
                                mcpInstall?.aiPrompt || '',
                                t('settings.mcpAiPromptCopied'),
                              )
                            }
                            disabled={!mcpInstall?.aiPrompt}
                          >
                            {t('settings.mcpCopyAiPrompt')}
                          </button>
                        </div>
                        <details className="settings-prompt-details">
                          <summary>{t('settings.mcpAiPromptPreview')}</summary>
                          <pre className="settings-code-block settings-code-block-tall">
                            {mcpInstall?.aiPrompt ||
                              (mcpLoading
                                ? t('settings.mcpLoading')
                                : '')}
                          </pre>
                        </details>
                      </SettingsBlock>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.mcpTitle')}
                        desc={t('settings.mcpDesc')}
                      >
                        <p className="settings-inline-hint">
                          {t('settings.mcpAutoToken')}
                        </p>
                        {mcpLoading && !mcpInstall ? (
                          <PageLoader label={t('settings.mcpLoading')} variant="block" />
                        ) : (
                          <div className="settings-fields">
                            <label className="auth-field">
                              <span>{t('settings.mcpEndpoint')}</span>
                              <div className="settings-inline-row">
                                <input
                                  type="text"
                                  readOnly
                                  value={
                                    mcpInstall?.endpoint ||
                                    mcpStatus?.endpoint ||
                                    ''
                                  }
                                  spellCheck={false}
                                />
                                <button
                                  type="button"
                                  className="nl-btn nl-btn-secondary"
                                  onClick={() =>
                                    void copyText(
                                      mcpInstall?.endpoint ||
                                        mcpStatus?.endpoint ||
                                        '',
                                    )
                                  }
                                >
                                  {t('settings.mcpCopyEndpoint')}
                                </button>
                              </div>
                            </label>
                            <label className="auth-field">
                              <span>{t('settings.mcpToken')}</span>
                              <div className="settings-inline-row">
                                <input
                                  type={mcpShowToken ? 'text' : 'password'}
                                  readOnly
                                  value={
                                    mcpInstall?.token ||
                                    mcpStatus?.token ||
                                    mcpStatus?.tokenHint ||
                                    ''
                                  }
                                  spellCheck={false}
                                />
                                <button
                                  type="button"
                                  className="nl-btn nl-btn-ghost"
                                  onClick={() => onShowTokenToggle()}
                                >
                                  {mcpShowToken
                                    ? t('settings.mcpHideToken')
                                    : t('settings.mcpShowToken')}
                                </button>
                                <button
                                  type="button"
                                  className="nl-btn nl-btn-secondary"
                                  onClick={() =>
                                    void copyText(
                                      mcpInstall?.token ||
                                        mcpStatus?.token ||
                                        '',
                                    )
                                  }
                                >
                                  {t('settings.mcpCopyToken')}
                                </button>
                              </div>
                              <em className="settings-field-meta">
                                {t('settings.mcpTokenHint')}
                              </em>
                            </label>
                            <div className="settings-meta-list is-inline">
                              <div className="settings-meta-row">
                                <dt>{t('settings.mcpLastUsed')}</dt>
                                <dd>
                                  {mcpStatus?.lastUsedAt ||
                                    t('settings.mcpNeverUsed')}
                                </dd>
                              </div>
                            </div>
                          </div>
                        )}
                      </SettingsBlock>
                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          {mcpStatus?.tokenHint
                            ? `hint: ${mcpStatus.tokenHint}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-danger"
                          onClick={() => onRegenerate()}
                          disabled={mcpBusy}
                        >
                          {mcpBusy
                            ? t('settings.mcpRegenerating')
                            : t('settings.mcpRegenerate')}
                        </button>
                      </div>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.mcpBaseUrl')}
                        desc={t('settings.mcpBaseUrlDesc')}
                      >
                        <div className="settings-inline-row">
                          <input
                            type="url"
                            value={mcpBaseUrl}
                            onChange={(e) => onBaseUrlChange(e.target.value)}
                            placeholder={t('settings.mcpBaseUrlPlaceholder')}
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="nl-btn nl-btn-secondary"
                            onClick={() => onReloadInstall()}
                            disabled={mcpLoading}
                          >
                            {t('settings.mcpReloadInstall')}
                          </button>
                        </div>
                      </SettingsBlock>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.mcpHowTo')}
                        desc={t('settings.mcpInstallDesc')}
                      >
                        <ol className="settings-steps">
                          <li>{t('settings.mcpHowTo1')}</li>
                          <li>{t('settings.mcpHowTo2')}</li>
                          <li>{t('settings.mcpHowTo3')}</li>
                        </ol>
                      </SettingsBlock>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.mcpInstallTitle')}
                        desc={t('settings.mcpInstallDesc')}
                      >
                        <div className="settings-chip-row" role="tablist">
                          {(
                            [
                              {
                                id: 'cursor' as const,
                                label: t('settings.mcpClientCursor'),
                              },
                              {
                                id: 'claude' as const,
                                label: t('settings.mcpClientClaude'),
                              },
                              {
                                id: 'codex' as const,
                                label: t('settings.mcpClientCodex'),
                              },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              role="tab"
                              aria-selected={mcpActiveClient === item.id}
                              className={[
                                'settings-chip',
                                mcpActiveClient === item.id ? 'is-active' : '',
                              ].join(' ')}
                              onClick={() => onActiveClientChange(item.id)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <pre className="settings-code-block">
                          {mcpActiveClient === 'cursor'
                            ? mcpInstall?.snippets.cursorJson || ''
                            : mcpActiveClient === 'claude'
                              ? mcpInstall?.snippets.claudeDesktopJson || ''
                              : mcpInstall?.snippets.codexJson ||
                                mcpInstall?.snippets.openclawJson ||
                                ''}
                        </pre>
                      </SettingsBlock>
                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          {mcpInstall?.endpoint || ''}
                        </span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => {
                            const snippet =
                              mcpActiveClient === 'cursor'
                                ? mcpInstall?.snippets.cursorJson
                                : mcpActiveClient === 'claude'
                                  ? mcpInstall?.snippets.claudeDesktopJson
                                  : mcpInstall?.snippets.codexJson;
                            if (snippet) void copyText(snippet);
                          }}
                          disabled={!mcpInstall}
                        >
                          {t('settings.mcpCopyConfig')}
                        </button>
                      </div>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.mcpToolsTitle')}
                        desc={t('settings.mcpToolsDesc')}
                      >
                        <ul className="settings-tool-list">
                          {(mcpStatus?.tools || []).map((tool) => (
                            <li key={tool.name}>
                              <code>{tool.name}</code>
                              <span>{tool.description}</span>
                            </li>
                          ))}
                        </ul>
                      </SettingsBlock>
                    </SettingsCard>
                  </div>
                </SettingsPanel>


  );
}
