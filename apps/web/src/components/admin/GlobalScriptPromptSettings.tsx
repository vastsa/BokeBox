import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchScriptPromptSettings,
  saveScriptPromptSettings,
} from '../../api/client';
import {
  commitScriptPromptField,
  draftScriptPromptField,
  emptyScriptPrompt,
  hasScriptPrompt,
  normalizeScriptPrompt,
  SCRIPT_PROMPT_FIELDS,
  summarizeScriptPrompt,
} from '../../lib/scriptPrompt';
import type { ScriptPromptOptions } from '../../types/job';
import { ScriptPromptForm } from './ScriptPromptForm';

/** 设置页：全局口播人设编辑 */
export function GlobalScriptPromptSettings() {
  const [value, setValue] = useState<ScriptPromptOptions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScriptPromptSettings();
      const next = normalizeScriptPrompt(data.scriptPrompt);
      setValue(next);
      const advancedKeys: Array<keyof ScriptPromptOptions> = [
        'openingStyle',
        'closingStyle',
        'maxChars',
        'extraInstructions',
      ];
      if (advancedKeys.some((k) => Boolean(next[k]))) {
        setShowAdvanced(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeScriptPrompt(value), [value]);
  const filledCount = useMemo(
    () => SCRIPT_PROMPT_FIELDS.filter((f) => Boolean(value[f.key])).length,
    [value],
  );

  const onChangeField = useCallback(
    (key: keyof ScriptPromptOptions, text: string) => {
      // 输入中不夹取字数上下限，避免中途被改写成 300
      setValue((prev) => draftScriptPromptField(prev, key, text));
      setSavedHint(false);
    },
    [],
  );

  const onBlurField = useCallback((key: keyof ScriptPromptOptions) => {
    setValue((prev) => commitScriptPromptField(prev, key));
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedHint(false);
    try {
      const next = await saveScriptPromptSettings(normalizeScriptPrompt(value));
      setValue(normalizeScriptPrompt(next));
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setValue(emptyScriptPrompt());
    setSavedHint(false);
  };

  return (
    <section className="settings-card settings-card-wide">
      <dl className="settings-meta-list" aria-label="当前人设摘要">
        <div className="settings-meta-row">
          <dt>当前摘要</dt>
          <dd title={summary}>{summary}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>状态</dt>
          <dd>
            {hasScriptPrompt(value)
              ? `已配置 ${filledCount} / ${SCRIPT_PROMPT_FIELDS.length} 项`
              : '未配置，使用系统默认'}
          </dd>
        </div>
      </dl>

      {loading ? (
        <div className="auth-loading">加载人设…</div>
      ) : (
        <>
          <div className="settings-block">
            <div className="settings-block-head">
              <h3>基础设定</h3>
              <p>主播身份、节目名称与表达风格。</p>
            </div>
            <ScriptPromptForm
              value={value}
              disabled={saving}
              onChangeField={onChangeField}
              onBlurField={onBlurField}
              group="basic"
            />
          </div>

          <div className="settings-block">
            <div className="settings-block-head settings-block-head-row">
              <div>
                <h3>结构偏好</h3>
                <p>开场、收尾与额外指令（可选）。</p>
              </div>
              <button
                type="button"
                className="settings-text-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? '收起' : '展开'}
              </button>
            </div>
            {showAdvanced ? (
              <ScriptPromptForm
                value={value}
                disabled={saving}
                onChangeField={onChangeField}
              onBlurField={onBlurField}
                group="advanced"
              />
            ) : (
              <p className="settings-collapsed-hint">
                未展开时保持系统默认结构；若已有高级配置会自动展开。
              </p>
            )}
          </div>

          {error && <div className="script-prompt-error">{error}</div>}

          <div className="settings-card-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => void onClear()}
              disabled={saving || !hasScriptPrompt(value)}
            >
              清空
            </button>
            <div className="settings-card-actions-right">
              {savedHint && <span className="script-prompt-saved">已保存</span>}
              <button
                type="button"
                className="nl-btn nl-btn-primary"
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
