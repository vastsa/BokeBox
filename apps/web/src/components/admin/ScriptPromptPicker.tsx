import { useCallback, useMemo } from 'react';
import {
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

export function ScriptPromptPicker({
  mode,
  value,
  globalValue,
  disabled = false,
  onModeChange,
  onChange,
}: {
  mode: ScriptPromptMode;
  value: ScriptPromptOptions;
  globalValue: ScriptPromptOptions;
  disabled?: boolean;
  onModeChange: (mode: ScriptPromptMode) => void;
  onChange: (next: ScriptPromptOptions) => void;
  /** @deprecated 全局编辑已迁至设置页，保留以兼容旧调用 */
  onGlobalChange?: (next: ScriptPromptOptions) => void;
}) {
  const activePrompt = mode === 'global' ? globalValue : value;
  const summary = useMemo(
    () => summarizeScriptPrompt(activePrompt),
    [activePrompt],
  );

  const updateField = useCallback(
    (key: keyof ScriptPromptOptions, text: string) => {
      onChange(normalizeScriptPrompt({ ...value, [key]: text }));
    },
    [onChange, value],
  );

  return (
    <div className={['script-prompt-picker', disabled ? 'is-disabled' : ''].join(' ')}>
      <div className="script-prompt-mode-tabs" role="tablist" aria-label="口播人设来源">
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
          本次单独设置
        </button>
      </div>

      <div className="script-prompt-summary-row">
        <span className="script-prompt-summary-label">
          {mode === 'global' ? '全局人设' : '本次人设'}
        </span>
        <span className="script-prompt-summary-value" title={summary}>
          {summary}
        </span>
      </div>

      {mode === 'global' && (
        <div className="script-prompt-global-box">
          {hasScriptPrompt(globalValue) ? (
            <dl className="script-prompt-preview">
              {SCRIPT_PROMPT_FIELDS.filter((f) => globalValue[f.key]).map((f) => (
                <div key={f.key} className="script-prompt-preview-row">
                  <dt>{f.label}</dt>
                  <dd>{globalValue[f.key]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="script-prompt-empty">
              尚未配置全局人设，生成时使用系统默认提示词。
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
              去设置中编辑
            </button>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="script-prompt-custom-box">
          <div className="script-prompt-hint">
            仅对本任务生效，不会改动全局默认。留空字段表示不干预。
          </div>
          <ScriptPromptForm
            value={value}
            disabled={disabled}
            onChangeField={updateField}
          />
          <div className="script-prompt-global-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled || !hasScriptPrompt(value)}
              onClick={() => onChange(emptyScriptPrompt())}
            >
              清空本次设置
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              disabled={disabled || !hasScriptPrompt(globalValue)}
              onClick={() => onChange({ ...globalValue })}
            >
              从全局复制
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
