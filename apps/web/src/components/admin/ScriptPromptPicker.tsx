import { useCallback, useMemo } from 'react';
import {
  commitScriptPromptField,
  draftScriptPromptField,
  emptyScriptPrompt,
  hasScriptPrompt,
  normalizeScriptPrompt,
  SCRIPT_PROMPT_FIELDS,
  summarizeScriptPrompt,
} from '../../lib/scriptPrompt';
import { navigate } from '../../lib/router';
import type { ScriptPromptMode, ScriptPromptOptions } from '../../types/job';
import { IconSpark } from '../icons';
import { ScriptPromptForm } from './ScriptPromptForm';
import { fetchScriptPromptSettings } from '../../api/client';
import { useI18n } from '../../i18n';

export function ScriptPromptPicker({
  mode,
  value,
  globalValue,
  disabled = false,
  compact = false,
  onModeChange,
  onChange,
}: {
  mode: ScriptPromptMode;
  value: ScriptPromptOptions;
  globalValue: ScriptPromptOptions;
  disabled?: boolean;
  /** 创建页精简模式：全局只显示摘要，不铺开字段 */
  compact?: boolean;
  onModeChange: (mode: ScriptPromptMode) => void;
  onChange: (next: ScriptPromptOptions) => void;
  /** @deprecated 全局编辑已迁至设置页，保留以兼容旧调用 */
  onGlobalChange?: (next: ScriptPromptOptions) => void;
}) {
  const { t } = useI18n();
  const activePrompt = mode === 'global' ? globalValue : value;
  const summary = useMemo(
    () => summarizeScriptPrompt(activePrompt),
    [activePrompt],
  );

  const updateField = useCallback(
    (key: keyof ScriptPromptOptions, text: string) => {
      onChange(draftScriptPromptField(value, key, text));
    },
    [onChange, value],
  );

  const blurField = useCallback(
    (key: keyof ScriptPromptOptions) => {
      onChange(commitScriptPromptField(value, key));
    },
    [onChange, value],
  );

  const globalFilled = SCRIPT_PROMPT_FIELDS.filter((f) => globalValue[f.key]);

  return (
    <div className={['script-prompt-picker', disabled ? 'is-disabled' : ''].join(' ')}>
      <div className="script-prompt-mode-tabs" role="tablist" aria-label={t('scriptPrompt.sourceAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'global'}
          className={['script-prompt-mode-tab', mode === 'global' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('global')}
        >
          {t('scriptPrompt.useGlobal')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'custom'}
          className={['script-prompt-mode-tab', mode === 'custom' ? 'is-active' : ''].join(' ')}
          disabled={disabled}
          onClick={() => onModeChange('custom')}
        >
          {t('scriptPrompt.useOnce')}
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

          {!compact && hasScriptPrompt(globalValue) && (
            <dl className="script-prompt-preview">
              {globalFilled.map((f) => (
                <div key={f.key} className="script-prompt-preview-row">
                  <dt>{f.label}</dt>
                  <dd>{globalValue[f.key]}</dd>
                </div>
              ))}
            </dl>
          )}

          {compact && hasScriptPrompt(globalValue) && globalFilled.length > 0 && (
            <div className="script-prompt-compact-tags">
              {globalFilled.slice(0, 4).map((f) => (
                <span key={f.key} className="script-prompt-compact-tag">
                  {f.label}
                </span>
              ))}
              {globalFilled.length > 4 && (
                <span className="script-prompt-compact-tag is-more">
                  +{globalFilled.length - 4}
                </span>
              )}
            </div>
          )}

          {!hasScriptPrompt(globalValue) && (
            <div className="script-prompt-empty">
              {t('scriptPrompt.noGlobal')}
            </div>
          )}

          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary script-prompt-edit-btn"
              disabled={disabled}
              onClick={() => navigate({ name: 'settings' })}
            >
              <IconSpark size={14} />
              {t('common.goSettings')}
            </button>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="script-prompt-custom-box">
          <div className="script-prompt-hint">
            {t('scriptPrompt.onceHint')}
          </div>
          <ScriptPromptForm
            value={value}
            disabled={disabled}
            onChangeField={updateField}
            onBlurField={blurField}
          />
          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled || !hasScriptPrompt(value)}
              onClick={() => onChange(emptyScriptPrompt())}
            >
              {t('common.clear')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled || !hasScriptPrompt(globalValue)}
              onClick={() => onChange({ ...globalValue })}
            >
              {t('common.copyFromGlobal')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 页面加载时拉取全局设置 */
export async function loadGlobalScriptPrompt(): Promise<ScriptPromptOptions> {
  try {
    const data = await fetchScriptPromptSettings();
    return normalizeScriptPrompt(data.scriptPrompt);
  } catch {
    return emptyScriptPrompt();
  }
}
