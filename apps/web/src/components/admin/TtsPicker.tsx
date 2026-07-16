import { useMemo } from 'react';
import { navigate } from '../../lib/router';
import type { TtsOptions, TtsSourceMode } from '../../types/job';
import { IconMic } from '../icons';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from './GlobalTtsSettings';
import { TtsModePicker } from './TtsModePicker';
import { TtsSummary } from './TtsSummary';
import { fetchTtsSettings } from '../../api/client';

export function TtsPicker({
  mode,
  value,
  globalValue,
  disabled = false,
  compact = false,
  onModeChange,
  onChange,
}: {
  mode: TtsSourceMode;
  value: TtsOptions;
  globalValue: TtsOptions;
  disabled?: boolean;
  compact?: boolean;
  onModeChange: (mode: TtsSourceMode) => void;
  onChange: (next: TtsOptions) => void;
}) {
  const active = mode === 'global' ? globalValue : value;
  const summary = useMemo(() => summarizeTts(active), [active]);

  return (
    <div className={['script-prompt-picker', disabled ? 'is-disabled' : ''].join(' ')}>
      <div className="script-prompt-mode-tabs" role="tablist" aria-label="音色来源">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'global'}
          className={['script-prompt-mode-tab', mode === 'global' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('global')}
        >
          使用全局
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'custom'}
          className={['script-prompt-mode-tab', mode === 'custom' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('custom')}
        >
          本次单独
        </button>
      </div>

      {mode === 'global' && (
        <div className="script-prompt-global-box">
          <div className="script-prompt-summary-row">
            <span className="script-prompt-summary-label">当前</span>
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
              去设置编辑
            </button>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="script-prompt-custom-box">
          <div className="script-prompt-hint">
            仅对本任务生效，不会改动全局默认音色。
          </div>
          <TtsModePicker value={value} onChange={onChange} />
          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled}
              onClick={() => onChange({ ...globalValue })}
            >
              从全局复制
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled}
              onClick={() => onChange({ ...DEFAULT_GLOBAL_TTS })}
            >
              恢复系统默认
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
