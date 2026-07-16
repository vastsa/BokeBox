import type { TtsOptions } from '../../types/job';

const MODE_LABEL: Record<string, string> = {
  default: '自然口播',
  voicedesign: '自定义音色',
  // 历史兼容
  sing: '自然口播',
};

const MODE_DESC: Record<string, string> = {
  default: '预置精品音色 · 音频标签控制',
  voicedesign: 'Voice Design · 自然语言描述',
  sing: '预置精品音色 · 音频标签控制',
};

export function TtsSummary({
  value,
  compact = false,
}: {
  value?: TtsOptions | null;
  compact?: boolean;
}) {
  const tts = value || { mode: 'default' as const, voice: '冰糖' };
  const modeKey = tts.mode === ('sing' as string) ? 'default' : tts.mode;
  const modeLabel = MODE_LABEL[modeKey] || modeKey;
  const modeDesc = MODE_DESC[modeKey] || '';
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
            <span className="label">音色</span>
            <span className="value">{tts.voice || '冰糖'}</span>
          </div>
        )}

        {modeKey === 'voicedesign' && (
          <div className="tts-summary-item is-wide">
            <span className="label">音色描述</span>
            <span className="value is-wrap">
              {tts.voiceDesign?.trim() || '未填写'}
            </span>
          </div>
        )}

        {modeKey === 'default' && (
          <div className="tts-summary-item is-wide">
            <span className="label">风格标签</span>
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
                '由口播稿内标签控制'
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
