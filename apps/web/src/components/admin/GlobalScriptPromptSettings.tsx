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
import type { ScriptPromptOptions } from '../../types/job';
import { IconSpark } from '../icons';
import { ScriptPromptForm } from './ScriptPromptForm';

/** 设置页：全局口播人设编辑 */
export function GlobalScriptPromptSettings() {
  const [value, setValue] = useState<ScriptPromptOptions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScriptPromptSettings();
      setValue(normalizeScriptPrompt(data.scriptPrompt));
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

  const onChangeField = useCallback(
    (key: keyof ScriptPromptOptions, text: string) => {
      setValue((prev) => normalizeScriptPrompt({ ...prev, [key]: text }));
      setSavedHint(false);
    },
    [],
  );

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedHint(false);
    try {
      const next = await saveScriptPromptSettings(value);
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
      <div className="settings-card-head">
        <IconSpark size={16} />
        <div>
          <h2>全局口播人设</h2>
          <p>
            制作时选择「使用全局」会应用这里的配置。当前：
            <strong> {summary}</strong>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="auth-loading">加载人设…</div>
      ) : (
        <>
          {hasScriptPrompt(value) ? (
            <div className="script-prompt-preview-wrap">
              <dl className="script-prompt-preview">
                {SCRIPT_PROMPT_FIELDS.filter((f) => value[f.key]).map((f) => (
                  <div key={f.key} className="script-prompt-preview-row">
                    <dt>{f.label}</dt>
                    <dd>{value[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="script-prompt-empty">
              尚未配置。留空则生成时使用系统默认提示词。
            </div>
          )}

          <ScriptPromptForm
            value={value}
            disabled={saving}
            onChangeField={onChangeField}
          />

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
                {saving ? '保存中…' : '保存人设'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
