import { useI18n } from '../../i18n';
import type { PublicSiteSeo } from '../../api/client';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

type Props = {
  active: boolean;
  guestHomePublic: boolean;
  siteName: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoPreview: PublicSiteSeo;
  savingAccess: boolean;
  savingSite: boolean;
  onToggleGuestHome: (next: boolean) => void;
  onSiteNameChange: (value: string) => void;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
  onSeoKeywordsChange: (value: string) => void;
  onSaveSite: () => void;
};

export function SiteSettingsTab({
  active,
  guestHomePublic,
  siteName,
  seoTitle,
  seoDescription,
  seoKeywords,
  seoPreview,
  savingAccess,
  savingSite,
  onToggleGuestHome,
  onSiteNameChange,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onSeoKeywordsChange,
  onSaveSite,
}: Props) {
  const { t } = useI18n();
  return (
                <SettingsPanel id="site" active={active}>
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
                              onChange={(e) => onSiteNameChange(e.target.value)}
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
                              onChange={(e) => onSeoTitleChange(e.target.value)}
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
                                onSeoDescriptionChange(e.target.value)
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
                              onChange={(e) => onSeoKeywordsChange(e.target.value)}
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
                          onClick={() => onSaveSite()}
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


  );
}
