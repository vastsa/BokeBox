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
import { useI18n } from '../../i18n';

/** 设置页：全局口播人设编辑 */
export function GlobalScriptPromptSettings() {
  const { t } = useI18n();
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
      <dl className="settings-meta-list" aria-label={t('scriptPrompt.metaAria')}>
        <div className="settings-meta-row">
          <dt>{t('scriptPrompt.metaSummary')}</dt>
          <dd title={summary}>{summary}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>{t('scriptPrompt.metaStatus')}</dt>
          <dd>
            {hasScriptPrompt(value)
              ? t('scriptPrompt.filled', { filled: filledCount, total: SCRIPT_PROMPT_FIELDS.length })
               : t('scriptPrompt.notConfigured')}
          </dd>
        </div>
      </dl>

      {loading ? (
        <div className="auth-loading">{t('scriptPrompt.loading')}</div>
      ) : (
        <>
          <div className="settings-block">
            <div className="settings-block-head">
              <h3>{t('scriptPrompt.basic')}</h3>
              <p>{t('scriptPrompt.basicDesc')}</p>
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
                <h3>{t('scriptPrompt.structure')}</h3>
                <p>{t('scriptPrompt.structureDesc')}</p>
              </div>
              <button
                type="button"
                className="settings-text-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? t('common.collapse') : t('common.expand')}
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
                {t('scriptPrompt.advancedKeep')}
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
              {t('common.clear')}
            </button>
            <div className="settings-card-actions-right">
              {savedHint && <span className="script-prompt-saved">{t('common.saved')}</span>}
              <button
                type="button"
                className="nl-btn nl-btn-primary"
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
