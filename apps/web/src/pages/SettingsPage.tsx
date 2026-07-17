import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  changePassword,
  fetchAccessSettings,
  fetchAiSettings,
  fetchMe,
  logout,
  saveAccessSettings,
  saveAiSettings,
  type PublicAiConfig,
} from '../api/client';
import { GlobalCoverPromptSettings } from '../components/admin/GlobalCoverPromptSettings';
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

type SettingsTab = 'voice' | 'persona' | 'cover' | 'ai' | 'site' | 'account';

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
  const [ai, setAi] = useState<PublicAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [asrModel, setAsrModel] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [voiceDesignModel, setVoiceDesignModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [defaultVoice, setDefaultVoice] = useState('');
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
            id: 'cover' as const,
            label: t('settings.tabCover'),
            desc: t('settings.tabCoverDesc'),
          },
          {
            id: 'ai' as const,
            label: t('settings.tabAi'),
            desc: t('settings.tabAiDesc'),
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
      const [me, aiCfg, access] = await Promise.all([
        fetchMe(),
        fetchAiSettings(),
        fetchAccessSettings(),
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
      setBaseUrl(aiCfg.baseUrl);
      setChatModel(aiCfg.chatModel);
      setAsrModel(aiCfg.asrModel);
      setTtsModel(aiCfg.ttsModel);
      setVoiceDesignModel(aiCfg.voiceDesignModel);
      setImageModel(aiCfg.imageModel || '');
      setDefaultVoice(aiCfg.defaultVoice);
      setContentLocale(resolveContentLocale(aiCfg.contentLocale));
      setContentLocaleOptions(aiCfg.contentLocales || []);
      setApiKey('');
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

  const onSaveAi = async () => {
    setSavingAi(true);
    setMsg(null);
    setError(null);
    try {
      const next = await saveAiSettings({
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim(),
        chatModel: chatModel.trim(),
        asrModel: asrModel.trim(),
        ttsModel: ttsModel.trim(),
        voiceDesignModel: voiceDesignModel.trim(),
        imageModel: imageModel.trim(),
        defaultVoice: defaultVoice.trim(),
        contentLocale,
      });
      setAi(next);
      setImageModel(next.imageModel || '');
      setContentLocale(resolveContentLocale(next.contentLocale));
      if (next.contentLocales) setContentLocaleOptions(next.contentLocales);
      setApiKey('');
      setMsg(t('settings.aiSaved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAi(false);
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

                <SettingsPanel id="cover" active={tab === 'cover'}>
                  <GlobalCoverPromptSettings />
                </SettingsPanel>

                <SettingsPanel id="ai" active={tab === 'ai'}>
                  <div className="settings-stack">
                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.connection')}
                        desc={t('settings.connectionDesc')}
                      >
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>
                              API Key
                              <em className="settings-field-meta">
                                {ai?.apiKeySet
                                  ? t('settings.apiKeySet')
                                  : t('settings.apiKeyUnset')}
                              </em>
                            </span>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={
                                ai?.apiKeySet
                                  ? t('settings.apiKeyOverride')
                                  : t('settings.apiKeyRequired')
                              }
                              autoComplete="off"
                            />
                          </label>
                          <label className="auth-field">
                            <span>Base URL</span>
                            <input
                              value={baseUrl}
                              onChange={(e) => setBaseUrl(e.target.value)}
                              spellCheck={false}
                              autoComplete="off"
                            />
                          </label>
                        </div>
                      </SettingsBlock>
                    </SettingsCard>

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
                    </SettingsCard>

                    <SettingsCard>
                      <SettingsBlock
                        title={t('settings.models')}
                        desc={t('settings.modelsDesc')}
                      >
                        <div className="settings-fields settings-fields-2">
                          <label className="auth-field">
                            <span>{t('settings.chatModel')}</span>
                            <input
                              value={chatModel}
                              onChange={(e) => setChatModel(e.target.value)}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field">
                            <span>{t('settings.asrModel')}</span>
                            <input
                              value={asrModel}
                              onChange={(e) => setAsrModel(e.target.value)}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field">
                            <span>{t('settings.ttsModel')}</span>
                            <input
                              value={ttsModel}
                              onChange={(e) => setTtsModel(e.target.value)}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field">
                            <span>{t('settings.voiceDesignModel')}</span>
                            <input
                              value={voiceDesignModel}
                              onChange={(e) =>
                                setVoiceDesignModel(e.target.value)
                              }
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field">
                            <span>{t('settings.imageModel')}</span>
                            <input
                              value={imageModel}
                              onChange={(e) => setImageModel(e.target.value)}
                              placeholder={t('settings.imagePlaceholder')}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field">
                            <span>{t('settings.defaultVoiceId')}</span>
                            <input
                              value={defaultVoice}
                              onChange={(e) => setDefaultVoice(e.target.value)}
                              placeholder={t('settings.defaultVoicePlaceholder')}
                              spellCheck={false}
                            />
                          </label>
                        </div>
                        <p className="settings-field-tip">
                          {t('settings.imageHintPrefix')}
                          <code>/images/generations</code>{' '}
                          {t('settings.imageHintSuffix')}
                        </p>
                      </SettingsBlock>

                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          {t('settings.adminOnly')}
                        </span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onSaveAi()}
                          disabled={savingAi}
                        >
                          {savingAi ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
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
                            guestHomePublic ? 'is-on' : '',
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
                          <input
                            type="checkbox"
                            className="upload-switch-input"
                            checked={guestHomePublic}
                            disabled={savingAccess}
                            onChange={(e) =>
                              void onToggleGuestHome(e.target.checked)
                            }
                          />
                          <span className="upload-switch-ui" aria-hidden />
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
