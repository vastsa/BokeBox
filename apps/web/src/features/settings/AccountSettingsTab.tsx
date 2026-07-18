import { useI18n, type Locale } from '../../i18n';
import type { ThemePreference } from '../../lib/theme';
import { PROJECT_GITHUB_URL, PROJECT_LICENSE_SPDX } from '../../lib/project';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

type Props = {
  active: boolean;
  username: string;
  locale: Locale;
  locales: Locale[];
  meta: Record<string, { nativeLabel: string; label: string; short?: string; englishLabel?: string }>;
  themePref: ThemePreference;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  savingPw: boolean;
  onLocaleChange: (code: Locale) => void;
  onThemeChange: (next: ThemePreference) => void;
  onCurrentPasswordChange: (v: string) => void;
  onNewPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onChangePassword: () => void;
  onLogout: () => void;
};

export function AccountSettingsTab({
  active,
  username,
  locale,
  locales,
  meta,
  themePref,
  currentPassword,
  newPassword,
  confirmPassword,
  savingPw,
  onLocaleChange,
  onThemeChange,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onChangePassword,
  onLogout,
}: Props) {
  const { t } = useI18n();
  return (
                <SettingsPanel id="account" active={active}>
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
                          onClick={() => onLogout()}
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
                                onClick={() => onLocaleChange(code)}
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
                                onCurrentPasswordChange(e.target.value)
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
                                onChange={(e) => onNewPasswordChange(e.target.value)}
                                autoComplete="new-password"
                              />
                            </label>
                            <label className="auth-field">
                              <span>{t('settings.confirmPassword')}</span>
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                  onConfirmPasswordChange(e.target.value)
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
                          onClick={() => onChangePassword()}
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

  );
}
