import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchScriptPromptSettings,
  saveScriptPromptSettings,
} from '../../api/client';
import {
  emptyScriptPrompt,
  hasScriptPrompt,
  normalizeScriptPrompt,
  SCRIPT_PROMPT_FIELDS,
  summarizeScriptPrompt,
} from '../../lib/scriptPrompt';
import type { ScriptPromptMode, ScriptPromptOptions } from '../../types/job';
import { IconSpark } from '../icons';

export function ScriptPromptPicker({
  mode,
  value,
  globalValue,
  disabled = false,
  onModeChange,
  onChange,
  onGlobalChange,
}: {
  mode: ScriptPromptMode;
  value: ScriptPromptOptions;
  globalValue: ScriptPromptOptions;
  disabled?: boolean;
  onModeChange: (mode: ScriptPromptMode) => void;
  onChange: (next: ScriptPromptOptions) => void;
  onGlobalChange: (next: ScriptPromptOptions) => void;
}) {
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [draftGlobal, setDraftGlobal] = useState<ScriptPromptOptions>({});
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSavedHint, setGlobalSavedHint] = useState(false);

  useEffect(() => {
    if (!editingGlobal) setDraftGlobal(globalValue);
  }, [editingGlobal, globalValue]);

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

  const updateGlobalField = useCallback(
    (key: keyof ScriptPromptOptions, text: string) => {
      setDraftGlobal((prev) =>
        normalizeScriptPrompt({ ...prev, [key]: text }),
      );
    },
    [],
  );

  const saveGlobal = async () => {
    setSavingGlobal(true);
    setGlobalError(null);
    setGlobalSavedHint(false);
    try {
      const next = await saveScriptPromptSettings(draftGlobal);
      onGlobalChange(next);
      setEditingGlobal(false);
      setGlobalSavedHint(true);
      window.setTimeout(() => setGlobalSavedHint(false), 2000);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGlobal(false);
    }
  };

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
          {!editingGlobal ? (
            <>
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
                  onClick={() => {
                    setDraftGlobal(globalValue);
                    setEditingGlobal(true);
                  }}
                >
                  <IconSpark size={14} />
                  编辑全局设置
                </button>
                {globalSavedHint && (
                  <span className="script-prompt-saved">已保存</span>
                )}
              </div>
            </>
          ) : (
            <>
              <ScriptPromptForm
                value={draftGlobal}
                disabled={disabled || savingGlobal}
                onChangeField={updateGlobalField}
              />
              {globalError && (
                <div className="script-prompt-error">{globalError}</div>
              )}
              <div className="script-prompt-global-actions">
                <button
                  type="button"
                  className="nl-btn nl-btn-secondary"
                  disabled={savingGlobal}
                  onClick={() => {
                    setEditingGlobal(false);
                    setGlobalError(null);
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  disabled={savingGlobal}
                  onClick={() => void saveGlobal()}
                >
                  {savingGlobal ? '保存中…' : '保存为全局'}
                </button>
              </div>
            </>
          )}
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

function ScriptPromptForm({
  value,
  disabled,
  onChangeField,
}: {
  value: ScriptPromptOptions;
  disabled?: boolean;
  onChangeField: (key: keyof ScriptPromptOptions, text: string) => void;
}) {
  return (
    <div className="script-prompt-form">
      {SCRIPT_PROMPT_FIELDS.map((field) => (
        <label key={field.key} className="script-prompt-field">
          <span className="script-prompt-field-label">{field.label}</span>
          {field.multiline ? (
            <textarea
              className="nl-textarea"
              rows={3}
              disabled={disabled}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={(e) => onChangeField(field.key, e.target.value)}
            />
          ) : (
            <input
              className="nl-input"
              type="text"
              disabled={disabled}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={(e) => onChangeField(field.key, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** 页面加载时拉取全局设置的小 hook 式 helper */
export async function loadGlobalScriptPrompt(): Promise<ScriptPromptOptions> {
  try {
    const data = await fetchScriptPromptSettings();
    return normalizeScriptPrompt(data.scriptPrompt);
  } catch {
    return emptyScriptPrompt();
  }
}
