import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PluginHubSettings } from '../components/admin/PluginHubSettings';
import { GlobalPromptSettings } from '../components/admin/GlobalPromptSettings';
import { GlobalScriptPromptSettings } from '../components/admin/GlobalScriptPromptSettings';
import { GlobalTtsSettings } from '../components/admin/GlobalTtsSettings';
import { ContentLocaleSelect } from '../components/admin/ContentLocaleSelect';
import { IconRefresh } from '../components/icons';
import { PageHeader } from '../components/ui/PageHeader';
import { SettingsToast } from '../components/ui/SettingsToast';
import { PageLoader } from '../components/ui/PageLoader';
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
import { setCachedSiteName } from '../lib/site';
import {
  buildPublicSiteSeo,
  setCachedSeo,
} from '../lib/seo';

import {
  SettingsBlock,
  SettingsCard,
  SettingsPanel,
  type SettingsTab,
} from '../features/settings/SettingsChrome';
import { McpSettingsTab } from '../features/settings/McpSettingsTab';
import { SiteSettingsTab } from '../features/settings/SiteSettingsTab';
import { AccountSettingsTab } from '../features/settings/AccountSettingsTab';
import { ScheduleSettingsTab } from '../features/settings/ScheduleSettingsTab';

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

  const dismissToast = useCallback(() => {
    setMsg(null);
    setError(null);
  }, []);

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
            id: 'sources' as const,
            label: t('settings.tabSources'),
            desc: t('settings.tabSourcesDesc'),
          },
          {
            id: 'schedules' as const,
            label: t('settings.tabSchedules'),
            desc: t('settings.tabSchedulesDesc'),
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
              <PageLoader label={t('settings.loading')} variant="block" />
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
                      </SettingsBlock>
                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          {t('settings.adminOnly')}
                        </span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onSaveAiLocaleOnly()}
                          disabled={savingAi}
                        >
                          {savingAi ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </SettingsCard>

                    <AiServiceSettings
                      onMessage={setMsg}
                      onError={setError}
                    />
                  </div>
                </SettingsPanel>

                <SettingsPanel id="sources" active={tab === 'sources'}>
                  <PluginHubSettings
                    onMessage={setMsg}
                    onError={setError}
                  />
                </SettingsPanel>

                <ScheduleSettingsTab
                  active={tab === 'schedules'}
                  onMessage={setMsg}
                  onError={setError}
                />

                <McpSettingsTab
                  active={tab === 'mcp'}
                  mcpStatus={mcpStatus}
                  mcpInstall={mcpInstall}
                  mcpLoading={mcpLoading}
                  mcpBusy={mcpBusy}
                  mcpShowToken={mcpShowToken}
                  mcpBaseUrl={mcpBaseUrl}
                  mcpActiveClient={mcpActiveClient}
                  onBaseUrlChange={setMcpBaseUrl}
                  onShowTokenToggle={() => setMcpShowToken((v) => !v)}
                  onActiveClientChange={setMcpActiveClient}
                  onReloadInstall={() => void loadMcpInstall(mcpBaseUrl)}
                  onRegenerate={() => void onRegenerateMcp()}
                  copyText={copyText}
                />
                <SiteSettingsTab
                  active={tab === 'site'}
                  guestHomePublic={guestHomePublic}
                  siteName={siteName}
                  seoTitle={seoTitle}
                  seoDescription={seoDescription}
                  seoKeywords={seoKeywords}
                  seoPreview={seoPreview}
                  savingAccess={savingAccess}
                  savingSite={savingSite}
                  onToggleGuestHome={(next) => void onToggleGuestHome(next)}
                  onSiteNameChange={setSiteName}
                  onSeoTitleChange={setSeoTitle}
                  onSeoDescriptionChange={setSeoDescription}
                  onSeoKeywordsChange={setSeoKeywords}
                  onSaveSite={() => void onSaveSite()}
                />
                <AccountSettingsTab
                  active={tab === 'account'}
                  username={username}
                  locale={locale}
                  locales={locales}
                  meta={meta}
                  themePref={themePref}
                  currentPassword={currentPassword}
                  newPassword={newPassword}
                  confirmPassword={confirmPassword}
                  savingPw={savingPw}
                  onLocaleChange={setLocale}
                  onThemeChange={onThemeChange}
                  onCurrentPasswordChange={setCurrentPassword}
                  onNewPasswordChange={setNewPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                  onChangePassword={() => void onChangePassword()}
                  onLogout={() => void onLogout()}
                />
              </div>
            )}
          </div>
        </div>

        {error ? (
          <SettingsToast message={error} tone="err" onDismiss={dismissToast} />
        ) : msg ? (
          <SettingsToast message={msg} tone="ok" onDismiss={dismissToast} />
        ) : null}
      </div>
    </AppShell>
  );
}
