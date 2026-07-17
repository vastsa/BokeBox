import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  changePassword,
  fetchAccessSettings,
  fetchAiSettings,
  fetchMcpInstall,
  fetchMcpStatus,
  fetchMe,
  logout,
  regenerateMcpToken,
  saveAccessSettings,
  saveAiSettings,
  type McpInstallBundle,
  type McpStatus,
  type PublicAiConfig,
} from '../api/client';
import { AiServiceSettings } from '../components/admin/AiServiceSettings';
import { GlobalPromptSettings } from '../components/admin/GlobalPromptSettings';
import { GlobalScriptPromptSettings } from '../components/admin/GlobalScriptPromptSettings';
import { GlobalTtsSettings } from '../components/admin/GlobalTtsSettings';
import { ContentLocaleSelect } from '../components/admin/ContentLocaleSelect';
import { IconRefresh } from '../components/icons';
import { PageHeader } from '../components/ui/PageHeader';
import { clearAuthSession } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from '../lib/theme';
import {
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../i18n';
import { AppShell } from '../layouts/AppShell';
import { PROJECT_GITHUB_URL, PROJECT_LICENSE_SPDX } from '../lib/project';
import { setCachedSiteName } from '../lib/site';
import {
  buildPublicSiteSeo,
  setCachedSeo,
} from '../lib/seo';

type SettingsTab = 'voice' | 'persona' | 'prompts' | 'ai' | 'mcp' | 'site' | 'account';

function SettingsPanel({
  id,
  active,
  children,
}: {
  id: SettingsTab;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      className="settings-tab-panel"
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-labelledby={`settings-tab-${id}`}
    >
      {children}
    </div>
  );
}

function SettingsCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={['settings-card', 'settings-card-wide', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </section>
  );
}

function SettingsBlock({
  title,
  desc,
  children,
  bare = false,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={bare ? 'settings-block is-bare' : 'settings-block'}>
      <div className="settings-block-head">
        <h3>{title}</h3>
        {desc ? <p>{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ route }: { route: Route }) {
  const { t, locale, setLocale, locales, meta } = useI18n();
  const [tab, setTab] = useState<SettingsTab>('voice');
  const [username, setUsername] = useState('');
  const [, setAi] = useState<PublicAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contentLocale, setContentLocale] = useState<Locale>('zh-CN');
  const [contentLocaleOptions, setContentLocaleOptions] = useState<
    Array<{ code: string; nativeLabel: string; label: string; short?: string }>
  >([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    getThemePreference(),
  );
  const [guestHomePublic, setGuestHomePublic] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);
  const [savingSite, setSavingSite] = useState(false);

  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [mcpInstall, setMcpInstall] = useState<McpInstallBundle | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpShowToken, setMcpShowToken] = useState(false);
  const [mcpBaseUrl, setMcpBaseUrl] = useState('');
  const [mcpActiveClient, setMcpActiveClient] = useState<
    'cursor' | 'claude' | 'codex'
  >('cursor');

  const tabs = useMemo(
    () =>
      (
        [
          {
            id: 'voice' as const,
            label: t('settings.tabVoice'),
            desc: t('settings.tabVoiceDesc'),
          },
          {
            id: 'persona' as const,
            label: t('settings.tabPersona'),
            desc: t('settings.tabPersonaDesc'),
          },
          {
            id: 'prompts' as const,
            label: t('settings.tabPrompts'),
            desc: t('settings.tabPromptsDesc'),
          },
          {
            id: 'ai' as const,
            label: t('settings.tabAi'),
            desc: t('settings.tabAiDesc'),
          },
          {
            id: 'mcp' as const,
            label: t('settings.tabMcp'),
            desc: t('settings.tabMcpDesc'),
          },
          {
            id: 'site' as const,
            label: t('settings.tabSite'),
            desc: t('settings.tabSiteDesc'),
          },
          {
            id: 'account' as const,
            label: t('settings.tabAccount'),
            desc: t('settings.tabAccountDesc'),
          },
        ] as const
      ).map((x) => ({ ...x })),
    [t],
  );

  const activeTab = useMemo(
    () => tabs.find((item) => item.id === tab) || tabs[0],
    [tab, tabs],
  );

  const seoPreview = useMemo(
    () =>
      buildPublicSiteSeo(
        {
          title: seoTitle,
          description: seoDescription,
          keywords: seoKeywords,
        },
        siteName,
      ),
    [seoTitle, seoDescription, seoKeywords, siteName],
  );

  useEffect(() => {
    return subscribeTheme((theme) => {
      setThemePref(theme);
    });
  }, []);

  const onThemeChange = (next: ThemePreference) => {
    setThemePref(next);
    setThemePreference(next);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, aiCfg, access, mcp] = await Promise.all([
        fetchMe(),
        fetchAiSettings(),
        fetchAccessSettings(),
        fetchMcpStatus().catch(() => null),
      ]);
      setUsername(me.username);
      setGuestHomePublic(Boolean(access.guestHomePublic));
      setSiteName(String(access.siteName || ''));
      setCachedSiteName(access.siteName || '');
      const input = access.seoInput || {
        title: '',
        description: '',
        keywords: '',
      };
      setSeoTitle(input.title || '');
      setSeoDescription(input.description || '');
      setSeoKeywords(input.keywords || '');
      if (access.seo) setCachedSeo(access.seo);
      setAi(aiCfg);
      setContentLocale(resolveContentLocale(aiCfg.contentLocale));
      setContentLocaleOptions(aiCfg.contentLocales || []);
      if (mcp) {
        setMcpStatus(mcp);
        setMcpBaseUrl(mcp.baseUrl || '');
      }
      // 安装配置含明文 token，单独拉取
      try {
        setMcpLoading(true);
        const installRes = await fetchMcpInstall();
        setMcpInstall(installRes.install);
        setMcpStatus((prev) =>
          prev
            ? {
                ...prev,
                token: installRes.install.token,
                endpoint: installRes.install.endpoint,
              }
            : prev,
        );
      } catch {
        // ignore install load failure
      } finally {
        setMcpLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setMsg(null);
    setError(null);
  }, [tab]);

  const onSaveAiLocaleOnly = async () => {
    setSavingAi(true);
    setMsg(null);
    setError(null);
    try {
      const next = await saveAiSettings({ contentLocale });
      setAi(next);
      setContentLocale(resolveContentLocale(next.contentLocale));
      if (next.contentLocales) setContentLocaleOptions(next.contentLocales);
      setMsg(t('settings.aiSaved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAi(false);
    }
  };

  const copyText = async (value: string, okMsg?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg(okMsg || t('settings.mcpCopied'));
      setError(null);
    } catch {
      setError(t('settings.mcpCopyFailed'));
    }
  };

  const loadMcpInstall = async (baseUrl?: string) => {
    setMcpLoading(true);
    setError(null);
    try {
      const res = await fetchMcpInstall(baseUrl);
      setMcpInstall(res.install);
      setMcpStatus((prev) => ({
        enabled: true,
        hasToken: true,
        tokenHint: res.status.tokenHint || prev?.tokenHint || '',
        createdAt: res.status.createdAt || prev?.createdAt,
        updatedAt: res.status.updatedAt || prev?.updatedAt,
        lastUsedAt: res.status.lastUsedAt || prev?.lastUsedAt,
        username: res.status.username || prev?.username,
        endpoint: res.install.endpoint,
        baseUrl: baseUrl?.trim() || prev?.baseUrl || '',
        tools: (res.tools || []).map((x) => ({
          name: x.name,
          description: x.description,
        })),
        token: res.install.token,
      }));
      setMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMcpLoading(false);
    }
  };

  const onRegenerateMcp = async () => {
    setMcpBusy(true);
    setError(null);
    try {
      const res = await regenerateMcpToken();
      setMcpInstall(res.install);
      setMcpStatus({
        enabled: true,
        hasToken: true,
        tokenHint: res.tokenHint,
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
        lastUsedAt: res.lastUsedAt,
        username: res.username,
        endpoint: res.endpoint,
        baseUrl: mcpBaseUrl || mcpStatus?.baseUrl || '',
        tools: res.tools || mcpStatus?.tools || [],
        token: res.token,
      });
      setMsg(t('settings.mcpRegenerated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMcpBusy(false);
    }
  };

  const onChangePassword = async () => {
    setSavingPw(true);
    setMsg(null);
    setError(null);
    try {
      const res = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      clearAuthSession();
      setMsg(res.message || t('settings.passwordUpdated'));
      window.setTimeout(() => navigate({ name: 'login' }), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPw(false);
    }
  };

  const onLogout = async () => {
    await logout();
    clearAuthSession();
    navigate({ name: 'login' });
  };

  const onToggleGuestHome = async (next: boolean) => {
    const prev = guestHomePublic;
    setGuestHomePublic(next);
    setSavingAccess(true);
    setMsg(null);
    setError(null);
    try {
      const res = await saveAccessSettings({ guestHomePublic: next });
      if (res.siteName !== undefined) setSiteName(res.siteName || '');
      setGuestHomePublic(Boolean(res.guestHomePublic));
      setMsg(
        res.guestHomePublic
          ? t('settings.guestHomeEnabled')
          : t('settings.guestHomeDisabled'),
      );
    } catch (e) {
      setGuestHomePublic(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAccess(false);
    }
  };

  /** 站点名称 + SEO 一并保存 */
  const onSaveSite = async () => {
    setSavingSite(true);
    setMsg(null);
    setError(null);
    try {
      const res = await saveAccessSettings({
        siteName,
        seo: {
          title: seoTitle,
          description: seoDescription,
          keywords: seoKeywords,
        },
      });
      setSiteName(res.siteName || '');
      setCachedSiteName(res.siteName || '');
      const input = res.seoInput || {
        title: '',
        description: '',
        keywords: '',
      };
      setSeoTitle(input.title || '');
      setSeoDescription(input.description || '');
      setSeoKeywords(input.keywords || '');
      if (res.seo) setCachedSeo(res.seo);
      setMsg(t('settings.siteSaved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSite(false);
    }
  };

  return (
    <AppShell route={route}>
      <div className="page-container app-page nl-enter settings-page">
        <PageHeader
          title={t('settings.title')}
          subtitle={
            username
              ? `${t('settings.subtitle')} · ${username}`
              : t('settings.subtitle')
          }
          actions={
            <button
              type="button"
              className="app-page-icon-btn"
              onClick={() => void load()}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <IconRefresh size={15} />
            </button>
          }
        />

        <div className="settings-shell">
          <nav className="settings-nav" aria-label={t('settings.title')}>
            <div className="settings-nav-label">{t('settings.navLabel')}</div>
            <div className="settings-nav-track" role="tablist">
              {tabs.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${item.id}`}
                    aria-selected={active}
                    aria-controls={`settings-panel-${item.id}`}
                    className={['settings-nav-item', active ? 'is-active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setTab(item.id)}
                  >
                    <span className="settings-nav-item-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="settings-main">
            <div className="settings-panel-intro">
              <h2>{activeTab.label}</h2>
              <p>{activeTab.desc}</p>
            </div>

            {loading ? (
              <div className="auth-loading">{t('settings.loading')}</div>
            ) : (
              <div className="settings-tab-panels">
                <SettingsPanel id="voice" active={tab === 'voice'}>
                  <GlobalTtsSettings />
                </SettingsPanel>

                <SettingsPanel id="persona" active={tab === 'persona'}>
                  <GlobalScriptPromptSettings />
                </SettingsPanel>

                <SettingsPanel id="prompts" active={tab === 'prompts'}>
                  <GlobalPromptSettings />
                </SettingsPanel>

                <SettingsPanel id="ai" active={tab === 'ai'}>
                  <div className="settings-stack">
                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.contentLanguage')}
                        desc={t('settings.contentLanguageDesc')}
                      >
                        <ContentLocaleSelect
                          className="settings-locale-select"
                          value={contentLocale}
                          options={contentLocaleOptions}
                          aria-label={t('settings.contentLanguageAria')}
                          onChange={setContentLocale}
                        />
                        <div className="settings-card-actions" style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            className="nl-btn nl-btn-primary"
                            onClick={() => void onSaveAiLocaleOnly()}
                            disabled={savingAi}
                          >
                            {savingAi ? t('common.saving') : t('common.save')}
                          </button>
                        </div>
                      </SettingsBlock>
                    </SettingsCard>

                    <AiServiceSettings
                      onMessage={setMsg}
                      onError={setError}
                    />
                  </div>
                </SettingsPanel>


                <SettingsPanel id="mcp" active={tab === 'mcp'}>
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
                          <div className="auth-loading">
                            {t('settings.mcpLoading')}
                          </div>
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
                                  onClick={() => setMcpShowToken((v) => !v)}
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
                          onClick={() => void onRegenerateMcp()}
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
                            onChange={(e) => setMcpBaseUrl(e.target.value)}
                            placeholder={t('settings.mcpBaseUrlPlaceholder')}
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="nl-btn nl-btn-secondary"
                            onClick={() => void loadMcpInstall(mcpBaseUrl)}
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
                              onClick={() => setMcpActiveClient(item.id)}
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

                <SettingsPanel id="site" active={tab === 'site'}>
                  <div className="settings-stack">
                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.siteBrand')}
                        desc={t('settings.siteBrandDesc')}
                      >
                        <div className="settings-fields">
                          <label className="auth-field settings-field-span">
                            <span>{t('settings.siteName')}</span>
                            <input
                              type="text"
                              value={siteName}
                              onChange={(e) => setSiteName(e.target.value)}
                              placeholder={t('settings.siteNamePlaceholder')}
                              maxLength={48}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field settings-field-span">
                            <span>{t('settings.seoTitle')}</span>
                            <input
                              type="text"
                              value={seoTitle}
                              onChange={(e) => setSeoTitle(e.target.value)}
                              placeholder={t('settings.seoTitlePlaceholder')}
                              maxLength={80}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field settings-field-span">
                            <span>{t('settings.seoDescription')}</span>
                            <textarea
                              className="nl-textarea"
                              value={seoDescription}
                              onChange={(e) =>
                                setSeoDescription(e.target.value)
                              }
                              placeholder={t(
                                'settings.seoDescriptionPlaceholder',
                              )}
                              maxLength={300}
                              rows={3}
                            />
                          </label>
                          <label className="auth-field settings-field-span">
                            <span>{t('settings.seoKeywords')}</span>
                            <input
                              type="text"
                              value={seoKeywords}
                              onChange={(e) => setSeoKeywords(e.target.value)}
                              placeholder={t(
                                'settings.seoKeywordsPlaceholder',
                              )}
                              maxLength={200}
                              spellCheck={false}
                            />
                          </label>
                        </div>

                        <div
                          className="settings-seo-preview"
                          aria-label={t('settings.seoPreview')}
                        >
                          <div className="settings-seo-preview-label">
                            {t('settings.seoPreview')}
                          </div>
                          <div className="settings-seo-preview-title">
                            {seoPreview.title}
                          </div>
                          <div className="settings-seo-preview-desc">
                            {seoPreview.description}
                          </div>
                          <div className="settings-seo-preview-kw">
                            {seoPreview.keywords}
                          </div>
                        </div>
                      </SettingsBlock>

                      <div className="settings-card-actions">
                        <span />
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onSaveSite()}
                          disabled={savingSite}
                        >
                          {savingSite ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.guestHome')}
                        desc={t('settings.guestHomeDesc')}
                      >
                        <label
                          className={[
                            'upload-switch-row',
                            savingAccess ? 'is-busy' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="upload-switch-copy">
                            <span className="title">
                              {t('settings.guestHomeToggle')}
                            </span>
                            <span className="desc">
                              {t('settings.guestHomeToggleDesc')}
                            </span>
                          </span>
                          <span
                            className={[
                              'upload-switch',
                              guestHomePublic ? 'is-on' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <i />
                            <input
                              type="checkbox"
                              className="upload-switch-input"
                              checked={guestHomePublic}
                              disabled={savingAccess}
                              onChange={(e) =>
                                void onToggleGuestHome(e.target.checked)
                              }
                              aria-label={t('settings.guestHomeToggle')}
                            />
                          </span>
                        </label>
                      </SettingsBlock>
                    </SettingsCard>
                  </div>
                </SettingsPanel>

                <SettingsPanel id="account" active={tab === 'account'}>
                  <div className="settings-stack">
                    <SettingsCard>
                      <div className="settings-profile">
                        <div className="settings-profile-meta">
                          <div className="settings-profile-kicker">
                            {t('settings.profileKicker')}
                          </div>
                          <div className="settings-profile-name">
                            {username || '—'}
                          </div>
                          <div className="settings-profile-sub">
                            {t('common.admin')}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="nl-btn nl-btn-secondary"
                          onClick={() => void onLogout()}
                        >
                          {t('auth.logout')}
                        </button>
                      </div>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.language')}
                        desc={t('settings.languageDesc')}
                      >
                        <div
                          className="theme-pref-grid"
                          role="radiogroup"
                          aria-label={t('settings.languageAria')}
                        >
                          {locales.map((code) => {
                            const item = meta[code];
                            const active = locale === code;
                            return (
                              <button
                                key={code}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={[
                                  'theme-pref-card',
                                  active ? 'is-active' : '',
                                ].join(' ')}
                                onClick={() => setLocale(code)}
                              >
                                <span
                                  className="theme-pref-swatch lang-pref-swatch"
                                  data-tone={code}
                                  aria-hidden
                                >
                                  {item.short}
                                </span>
                                <span className="theme-pref-copy">
                                  <strong>{item.nativeLabel}</strong>
                                  <em>{item.label}</em>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </SettingsBlock>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.theme')}
                        desc={t('settings.themeDesc')}
                      >
                        <div
                          className="theme-pref-grid"
                          role="radiogroup"
                          aria-label={t('settings.themeAria')}
                        >
                          {(
                            [
                              {
                                id: 'light' as const,
                                label: t('settings.themeLight'),
                                desc: t('settings.themeLightDesc'),
                              },
                              {
                                id: 'dark' as const,
                                label: t('settings.themeDark'),
                                desc: t('settings.themeDarkDesc'),
                              },
                            ] as const
                          ).map((item) => {
                            const active = themePref === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={[
                                  'theme-pref-card',
                                  active ? 'is-active' : '',
                                ].join(' ')}
                                onClick={() => onThemeChange(item.id)}
                              >
                                <span
                                  className="theme-pref-swatch"
                                  data-tone={item.id}
                                  aria-hidden
                                />
                                <span className="theme-pref-copy">
                                  <strong>{item.label}</strong>
                                  <em>{item.desc}</em>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </SettingsBlock>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.changePassword')}
                        desc={t('settings.changePasswordDesc')}
                      >
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>{t('settings.currentPassword')}</span>
                            <input
                              type="password"
                              value={currentPassword}
                              onChange={(e) =>
                                setCurrentPassword(e.target.value)
                              }
                              autoComplete="current-password"
                            />
                          </label>
                          <div className="settings-fields-2">
                            <label className="auth-field">
                              <span>{t('settings.newPassword')}</span>
                              <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                              />
                            </label>
                            <label className="auth-field">
                              <span>{t('settings.confirmPassword')}</span>
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                  setConfirmPassword(e.target.value)
                                }
                                autoComplete="new-password"
                              />
                            </label>
                          </div>
                        </div>
                      </SettingsBlock>
                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          {t('settings.passwordHint')}
                        </span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onChangePassword()}
                          disabled={savingPw}
                        >
                          {savingPw
                            ? t('settings.updatingPassword')
                            : t('settings.updatePassword')}
                        </button>
                      </div>
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.aboutOpenSource')}
                        desc={t('settings.aboutOpenSourceDesc')}
                      >
                        <div className="settings-oss-row">
                          <div className="settings-oss-meta">
                            <span className="settings-oss-badge">
                              {t('app.openSourceBadge')}
                            </span>
                            <span>
                              {t('settings.licenseLabel')}: {PROJECT_LICENSE_SPDX}
                            </span>
                          </div>
                          <a
                            className="nl-btn nl-btn-secondary"
                            href={PROJECT_GITHUB_URL}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {t('settings.openGithub')}
                          </a>
                        </div>
                      </SettingsBlock>
                    </SettingsCard>
                  </div>
                </SettingsPanel>
              </div>
            )}
          </div>
        </div>

        {msg && <div className="settings-toast is-ok">{msg}</div>}
        {error && <div className="settings-toast is-err">{error}</div>}
      </div>
    </AppShell>
  );
}
