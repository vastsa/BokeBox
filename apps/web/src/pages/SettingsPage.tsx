import { useEffect, useMemo, useState } from 'react';
import {
  changePassword,
  fetchAiSettings,
  fetchMe,
  logout,
  saveAiSettings,
  type PublicAiConfig,
} from '../api/client';
import { GlobalCoverPromptSettings } from '../components/admin/GlobalCoverPromptSettings';
import { GlobalScriptPromptSettings } from '../components/admin/GlobalScriptPromptSettings';
import { GlobalTtsSettings } from '../components/admin/GlobalTtsSettings';
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
import { useI18n, type Locale } from '../i18n';
import { AppShell } from '../layouts/AppShell';

type SettingsTab = 'voice' | 'persona' | 'cover' | 'ai' | 'account';

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

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [themePref, setThemePref] = useState<ThemePreference>(() => getThemePreference());

  const tabs = useMemo(
    () =>
      (
        [
          { id: 'voice', label: t('settings.tabVoice'), desc: t('settings.tabVoiceDesc') },
          { id: 'persona', label: t('settings.tabPersona'), desc: t('settings.tabPersonaDesc') },
          { id: 'cover', label: t('settings.tabCover'), desc: t('settings.tabCoverDesc') },
          { id: 'ai', label: t('settings.tabAi'), desc: t('settings.tabAiDesc') },
          { id: 'account', label: t('settings.tabAccount'), desc: t('settings.tabAccountDesc') },
        ] as const
      ).map((x) => ({ ...x })),
    [t],
  );

  const activeTab = useMemo(
    () => tabs.find((item) => item.id === tab) || tabs[0],
    [tab, tabs],
  );

  const onLocaleChange = (next: Locale) => {
    setLocale(next);
  };

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
      const [me, aiCfg] = await Promise.all([fetchMe(), fetchAiSettings()]);
      setUsername(me.username);
      setAi(aiCfg);
      setBaseUrl(aiCfg.baseUrl);
      setChatModel(aiCfg.chatModel);
      setAsrModel(aiCfg.asrModel);
      setTtsModel(aiCfg.ttsModel);
      setVoiceDesignModel(aiCfg.voiceDesignModel);
      setImageModel(aiCfg.imageModel || '');
      setDefaultVoice(aiCfg.defaultVoice);
      setContentLocale(
        aiCfg.contentLocale === 'en-US' ? 'en-US' : 'zh-CN',
      );
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
      setContentLocale(
        next.contentLocale === 'en-US' ? 'en-US' : 'zh-CN',
      );
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

  return (
    <AppShell route={route}>
      <div className="page-container app-page nl-enter settings-page">
        <PageHeader
          title={t('settings.title')}
          subtitle={
            username
              ? t('settings.subtitle') + (username ? ` · ${username}` : '')
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
            <div className="settings-nav-label">{t('settings.title')}</div>
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
                {tab === 'voice' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-voice"
                    aria-labelledby="settings-tab-voice"
                  >
                    <GlobalTtsSettings />
                  </div>
                )}

                {tab === 'persona' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-persona"
                    aria-labelledby="settings-tab-persona"
                  >
                    <GlobalScriptPromptSettings />
                  </div>
                )}

                {tab === 'cover' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-cover"
                    aria-labelledby="settings-tab-cover"
                  >
                    <GlobalCoverPromptSettings />
                  </div>
                )}

                {tab === 'ai' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-ai"
                    aria-labelledby="settings-tab-ai"
                  >
                    <section className="settings-card settings-card-wide">
                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.connection')}</h3>
                          <p>{t('settings.connectionDesc')}</p>
                        </div>
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>
                              API Key
                              <em className="settings-field-meta">
                                {ai?.apiKeySet ? t('settings.apiKeySet') : t('settings.apiKeyUnset')}
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
                              placeholder="https://api.example.com/v1"
                              spellCheck={false}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.contentLanguage')}</h3>
                          <p>{t('settings.contentLanguageDesc')}</p>
                        </div>
                        <div
                          className="theme-pref-grid"
                          role="radiogroup"
                          aria-label={t('settings.contentLanguageAria')}
                        >
                          {locales.map((id) => {
                            const active = contentLocale === id;
                            const item = meta[id];
                            return (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={[
                                  'theme-pref-card',
                                  active ? 'is-active' : '',
                                ].join(' ')}
                                onClick={() => setContentLocale(id)}
                              >
                                <span
                                  className="theme-pref-swatch lang-pref-swatch"
                                  data-tone={id}
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
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.models')}</h3>
                          <p>{t('settings.modelsDesc')}</p>
                        </div>
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
                        </div>
                        <p className="settings-field-tip">
                          {t('settings.imageHintPrefix')}
                          <code>/images/generations</code> {t('settings.imageHintSuffix')}
                        </p>
                        <label className="auth-field settings-field-span">
                          <span>{t('settings.defaultVoiceId')}</span>
                          <input
                            value={defaultVoice}
                            onChange={(e) => setDefaultVoice(e.target.value)}
                            placeholder={t('settings.defaultVoicePlaceholder')}
                            spellCheck={false}
                          />
                        </label>
                      </div>

                      <div className="settings-card-actions">
                        <span className="settings-card-hint">{t('settings.adminOnly')}</span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onSaveAi()}
                          disabled={savingAi}
                        >
                          {savingAi ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {tab === 'account' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-account"
                    aria-labelledby="settings-tab-account"
                  >
                    <section className="settings-card settings-card-wide">
                      <div className="settings-profile">
                        <div className="settings-profile-meta">
                          <div className="settings-profile-kicker">{t('settings.profileKicker')}</div>
                          <div className="settings-profile-name">
                            {username || '—'}
                          </div>
                          <div className="settings-profile-sub">{t('common.admin')}</div>
                        </div>
                        <button
                          type="button"
                          className="nl-btn nl-btn-secondary"
                          onClick={() => void onLogout()}
                        >
                          {t('auth.logout')}
                        </button>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.language')}</h3>
                          <p>{t('settings.languageDesc')}</p>
                        </div>
                        <div className="theme-pref-grid" role="radiogroup" aria-label={t('settings.languageAria')}>
                          {locales.map((id) => {
                            const active = locale === id;
                            const item = meta[id];
                            return (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={['theme-pref-card', active ? 'is-active' : ''].join(' ')}
                                onClick={() => onLocaleChange(id)}
                              >
                                <span className="theme-pref-swatch lang-pref-swatch" data-tone={id} aria-hidden>
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
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.theme')}</h3>
                          <p>{t('settings.themeDesc')}</p>
                        </div>
                        <div className="theme-pref-grid" role="radiogroup" aria-label={t('settings.themeAria')}>
                          {(
                            [
                              { id: 'light', label: t('settings.themeLight'), desc: t('settings.themeLightDesc') },
                              { id: 'dark', label: t('settings.themeDark'), desc: t('settings.themeDarkDesc') },
                            ] as const
                          ).map((item) => {
                            const active = themePref === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={['theme-pref-card', active ? 'is-active' : ''].join(' ')}
                                onClick={() => onThemeChange(item.id)}
                              >
                                <span className="theme-pref-swatch" data-tone={item.id} aria-hidden />
                                <span className="theme-pref-copy">
                                  <strong>{item.label}</strong>
                                  <em>{item.desc}</em>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>{t('settings.changePassword')}</h3>
                          <p>{t('settings.changePasswordDesc')}</p>
                        </div>
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
                      </div>

                      <div className="settings-card-actions">
                        <span />
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onChangePassword()}
                          disabled={savingPw}
                        >
                          {savingPw ? t('settings.updatingPassword') : t('settings.updatePassword')}
                        </button>
                      </div>
                    </section>
                  </div>
                )}
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
