import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../lib/router';
import type { TtsOptions, TtsSourceMode } from '../../types/job';
import { IconMic } from '../icons';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from './GlobalTtsSettings';
import {
  defaultVoiceForProvider,
  isMimoTtsProvider,
  TtsModePicker,
} from './TtsModePicker';
import { TtsSummary } from './TtsSummary';
import { fetchAiSettings, fetchTtsSettings } from '../../api/client';
import { useI18n } from '../../i18n';

export function TtsPicker({
  mode,
  value,
  globalValue,
  disabled = false,
  compact = false,
  provider: providerProp,
  onModeChange,
  onChange,
}: {
  mode: TtsSourceMode;
  value: TtsOptions;
  globalValue: TtsOptions;
  disabled?: boolean;
  compact?: boolean;
  /** 当前 TTS 提供方；不传则自动拉取 AI 设置 */
  provider?: string;
  onModeChange: (mode: TtsSourceMode) => void;
  onChange: (next: TtsOptions) => void;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState(providerProp || 'mimo');
  const active = mode === 'global' ? globalValue : value;
  const summary = useMemo(() => summarizeTts(active), [active]);

  useEffect(() => {
    if (providerProp) {
      setProvider(providerProp);
      return;
    }
    let cancelled = false;
    void fetchAiSettings()
      .then((ai) => {
        if (cancelled) return;
        setProvider(ai.tts?.provider || ai.ttsProvider || 'mimo');
      })
      .catch(() => {
        if (!cancelled) setProvider('mimo');
      });
    return () => {
      cancelled = true;
    };
  }, [providerProp]);

  return (
    <div className={['script-prompt-picker', disabled ? 'is-disabled' : ''].join(' ')}>
      <div className="script-prompt-mode-tabs" role="tablist" aria-label={t('tts.sourceAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'global'}
          className={['script-prompt-mode-tab', mode === 'global' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('global')}
        >
          {t('tts.useGlobal')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'custom'}
          className={['script-prompt-mode-tab', mode === 'custom' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('custom')}
        >
          {t('tts.useOnce')}
        </button>
      </div>

      {mode === 'global' && (
        <div className="script-prompt-global-box">
          <div className="script-prompt-summary-row">
            <span className="script-prompt-summary-label">{t('common.current')}</span>
            <span className="script-prompt-summary-value" title={summary}>
              {summary}
            </span>
          </div>

          {!compact && <TtsSummary value={globalValue} />}
          {compact && <TtsSummary value={globalValue} compact />}

          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary script-prompt-edit-btn"
              disabled={disabled}
              onClick={() => navigate({ name: 'settings' })}
            >
              <IconMic size={14} />
              {t('common.goSettings')}
            </button>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="script-prompt-custom-box">
          <div className="script-prompt-hint">
            {t('tts.onceHint')}
          </div>
          <TtsModePicker
            value={value}
            provider={provider}
            onChange={onChange}
          />
          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled}
              onClick={() => onChange({ ...globalValue })}
            >
              {t('common.copyFromGlobal')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled}
              onClick={() =>
                onChange(
                  isMimoTtsProvider(provider)
                    ? { ...DEFAULT_GLOBAL_TTS }
                    : {
                        mode: 'default',
                        voice: defaultVoiceForProvider(provider),
                      },
                )
              }
            >
              {t('tts.restoreDefault')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 页面加载时拉取全局音色 */
export async function loadGlobalTts(): Promise<TtsOptions> {
  try {
    const data = await fetchTtsSettings();
    return data.tts || DEFAULT_GLOBAL_TTS;
  } catch {
    return DEFAULT_GLOBAL_TTS;
  }
}
