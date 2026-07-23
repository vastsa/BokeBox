import type { TtsOptions } from '../../types/job';
import type { TtsVoiceProfile } from '../../lib/ttsVoiceProfile';
import { formatTtsVoiceLabel } from '../../lib/ttsVoiceProfile';
import { useI18n } from '../../i18n';

const MODE_LABEL: Record<string, string> = {
  default: 'modeDefault',
  voicedesign: 'modeCustom',
  voiceclone: 'modeClone',
  // 历史兼容
  sing: 'modeDefault',
};

const MODE_DESC: Record<string, string> = {
  default: 'modeDefaultHint',
  voicedesign: 'modeCustomHint',
  voiceclone: 'modeCloneHint',
  sing: 'modeDefaultHint',
};

export function TtsSummary({
  value,
  compact = false,
  profile,
}: {
  value?: TtsOptions | null;
  compact?: boolean;
  /** 当前提供方音色画像；有则按插件形态展示 */
  profile?: TtsVoiceProfile | null;
}) {
  const { t } = useI18n();
  const tts = value || { mode: 'default' as const, voice: '' };
  const modeKey = tts.mode === ('sing' as string) ? 'default' : tts.mode;
  const modeLabel = t(`tts.${MODE_LABEL[modeKey] || 'modeDefault'}`);
  const modeDesc = MODE_DESC[modeKey] ? t(`tts.${MODE_DESC[modeKey]}`) : '';
  const styleTags = modeKey === 'default' ? tts.styleTags || [] : [];

  const voiceLabel =
    modeKey === 'voicedesign'
      ? tts.voiceDesign?.trim() || t('common.notFilled')
      : profile
        ? formatTtsVoiceLabel(tts.voice, profile, t('tts.refPluginDefaultShort'))
        : String(tts.voice || t('tts.refPluginDefaultShort'));

  const voiceFieldLabel =
    profile?.voiceUi === 'reference'
      ? t('tts.refVoiceId')
      : t('tts.labelVoice');

  // 仅 supportsStyleTags 的提供方展示风格行
  const showStyleRow =
    modeKey === 'default' && Boolean(profile?.supportsStyleTags);

  if (compact) {
    const parts = [modeLabel];
    if (modeKey === 'voiceclone') parts.push(voiceLabel || t('tts.cloneRef'));
    else if (modeKey !== 'voicedesign') parts.push(voiceLabel);
    if (showStyleRow && styleTags.length) parts.push(styleTags.join(' '));
    return <span>{parts.join(' · ')}</span>;
  }

  return (
    <div className="tts-summary">
      <div className="tts-summary-hero">
        <div className="tts-summary-mode">{modeLabel}</div>
        <div className="tts-summary-desc">
          {profile?.voiceUi === 'reference'
            ? t('tts.modeReferenceHint')
            : modeDesc}
        </div>
      </div>

      <div className="tts-summary-grid">
        {modeKey !== 'voicedesign' && modeKey !== 'voiceclone' && (
          <div className="tts-summary-item">
            <span className="label">{voiceFieldLabel}</span>
            <span className="value" title={voiceLabel}>
              {voiceLabel}
            </span>
          </div>
        )}

        {modeKey === 'voicedesign' && (
          <div className="tts-summary-item is-wide">
            <span className="label">{t('tts.labelDesc')}</span>
            <span className="value is-wrap">
              {tts.voiceDesign?.trim() || t('common.notFilled')}
            </span>
          </div>
        )}

        {modeKey === 'voiceclone' && (
          <div className="tts-summary-item is-wide">
            <span className="label">{t('tts.labelCloneRef')}</span>
            <span className="value is-wrap">
              {tts.voice?.trim() || t('tts.cloneUsePluginDefault')}
            </span>
          </div>
        )}

        {showStyleRow && (
          <div className="tts-summary-item is-wide">
            <span className="label">{t('tts.labelStyle')}</span>
            <span className="value">
              {styleTags.length ? (
                <span className="tts-summary-tags">
                  {styleTags.map((tag) => (
                    <span key={tag} className="tts-summary-tag">
                      {tag}
                    </span>
                  ))}
                </span>
              ) : (
                t('tts.controlledByScript')
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
