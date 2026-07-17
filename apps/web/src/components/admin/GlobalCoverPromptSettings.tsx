import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCoverPromptSettings,
  saveCoverPromptSettings,
  type CoverPromptSettings,
} from '../../api/client';
import { useI18n } from '../../i18n';

/** 设置页：全局封面提示词模板 */
export function GlobalCoverPromptSettings() {
  const { t } = useI18n();
  const [data, setData] = useState<CoverPromptSettings | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCoverPromptSettings();
      setData(next);
      setDraft(next.template || next.defaultTemplate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return draft.trim() !== (data.template || '').trim();
  }, [data, draft]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const next = await saveCoverPromptSettings({ template: draft });
      setData(next);
      setDraft(next.template);
      setHint(next.isCustom ? t('coverPrompt.savedCustom') : t('coverPrompt.savedDefault'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const next = await saveCoverPromptSettings({ reset: true });
      setData(next);
      setDraft(next.defaultTemplate);
      setHint(t('coverPrompt.restored'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onRestoreDefaultDraft = () => {
    if (!data) return;
    setDraft(data.defaultTemplate);
    setHint(null);
  };

  if (loading) {
    return <div className="auth-loading">{t('coverPrompt.loading')}</div>;
  }

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-block">
        <div className="settings-block-head">
          <h3>{t('coverPrompt.title')}</h3>
          <p>
            {t('coverPrompt.desc')}
            {data?.isCustom ? (
              <em className="settings-field-meta"> {t('coverPrompt.custom')}</em>
            ) : (
              <em className="settings-field-meta"> {t('coverPrompt.systemDefault')}</em>
            )}
          </p>
        </div>

        <label className="auth-field">
          <span>{t('coverPrompt.template')}</span>
          <textarea
            className="cover-prompt-textarea"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setHint(null);
            }}
            rows={18}
            spellCheck={false}
            placeholder={t('coverPrompt.placeholder')}
          />
        </label>

        {data?.variables?.length ? (
          <div className="cover-prompt-vars">
            <div className="cover-prompt-vars-title">{t('coverPrompt.varsTitle')}</div>
            <ul className="cover-prompt-vars-list">
              {data.variables.map((v) => (
                <li key={v.key}>
                  <code
                    role="button"
                    tabIndex={0}
                    title={t('coverPrompt.insert')}
                    onClick={() => {
                      setDraft((prev) => `${prev}{{${v.key}}}`);
                      setHint(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDraft((prev) => `${prev}{{${v.key}}}`);
                        setHint(null);
                      }
                    }}
                  >
                    {`{{${v.key}}}`}
                  </code>
                  <span>{v.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error && <div className="settings-inline-error">{error}</div>}
        {hint && <div className="settings-inline-ok">{hint}</div>}

        <div className="settings-card-actions cover-prompt-actions">
          <div className="cover-prompt-actions-left">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={onRestoreDefaultDraft}
              disabled={saving}
            >
              {t('coverPrompt.fillDefault')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => void onReset()}
              disabled={saving || !data?.isCustom}
            >
              {t('coverPrompt.restoreSave')}
            </button>
          </div>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? t('common.saving') : t('coverPrompt.save')}
          </button>
        </div>
      </div>
    </section>
  );
}
