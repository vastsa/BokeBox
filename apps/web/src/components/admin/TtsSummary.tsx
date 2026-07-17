import type { TtsOptions } from '../../types/job';
import { useI18n } from '../../i18n';

const MODE_LABEL: Record<string, string> = {
  default: 'modeDefault',
  voicedesign: 'modeCustom',
  // 历史兼容
  sing: 'modeDefault',
};

const MODE_DESC: Record<string, string> = {
  default: 'modeDefaultHint',
  voicedesign: 'modeCustomHint',
  sing: 'modeDefaultHint',
};

export function TtsSummary({
  value,
  compact = false,
}: {
  value?: TtsOptions | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const tts = value || { mode: 'default' as const, voice: '冰糖' };
  const modeKey = tts.mode === ('sing' as string) ? 'default' : tts.mode;
  const modeLabel = t(`tts.${MODE_LABEL[modeKey] || 'modeDefault'}`);
  const modeDesc = MODE_DESC[modeKey] ? t(`tts.${MODE_DESC[modeKey]}`) : '';
  const styleTags = modeKey === 'default' ? tts.styleTags || [] : [];

  if (compact) {
    const parts = [modeLabel];
    if (modeKey !== 'voicedesign' && tts.voice) parts.push(String(tts.voice));
    if (modeKey === 'default' && styleTags.length) parts.push(styleTags.join(' '));
    return <span>{parts.join(' · ')}</span>;
  }

  return (
    <div className="tts-summary">
      <div className="tts-summary-hero">
        <div className="tts-summary-mode">{modeLabel}</div>
        <div className="tts-summary-desc">{modeDesc}</div>
      </div>

      <div className="tts-summary-grid">
        {modeKey !== 'voicedesign' && (
          <div className="tts-summary-item">
            <span className="label">{t('tts.labelVoice')}</span>
            <span className="value">{tts.voice || '冰糖'}</span>
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

        {modeKey === 'default' && (
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
