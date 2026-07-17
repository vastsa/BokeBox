import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAllAiPromptSettings,
  saveAiPromptSettings,
  type AiPromptKind,
  type AiPromptSettings,
} from '../../api/client';
import { useI18n } from '../../i18n';

const KINDS: AiPromptKind[] = [
  'podcastSystem',
  'rewriteSystem',
  'flashcardSystem',
];

function kindTitleKey(kind: AiPromptKind): string {
  if (kind === 'podcastSystem') return 'aiPrompt.podcastTitle';
  if (kind === 'rewriteSystem') return 'aiPrompt.rewriteTitle';
  return 'aiPrompt.flashcardTitle';
}

function kindDescKey(kind: AiPromptKind): string {
  if (kind === 'podcastSystem') return 'aiPrompt.podcastDesc';
  if (kind === 'rewriteSystem') return 'aiPrompt.rewriteDesc';
  return 'aiPrompt.flashcardDesc';
}

/** 单个系统提示词编辑卡片 */
function AiPromptEditor({
  kind,
  data,
  onSaved,
}: {
  kind: AiPromptKind;
  data: AiPromptSettings;
  onSaved: (next: AiPromptSettings) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(data.template || data.defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setDraft(data.template || data.defaultTemplate);
    setHint(null);
    setError(null);
  }, [data]);

  const dirty = useMemo(
    () => draft.trim() !== (data.template || '').trim(),
    [data.template, draft],
  );

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const next = await saveAiPromptSettings(kind, { template: draft });
      onSaved(next);
      setDraft(next.template);
      setHint(
        next.isCustom ? t('aiPrompt.savedCustom') : t('aiPrompt.savedDefault'),
      );
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
      const next = await saveAiPromptSettings(kind, { reset: true });
      onSaved(next);
      setDraft(next.defaultTemplate);
      setHint(t('aiPrompt.restored'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-block">
        <div className="settings-block-head">
          <h3>{t(kindTitleKey(kind))}</h3>
          <p>
            {t(kindDescKey(kind))}
            {data.isCustom ? (
              <em className="settings-field-meta"> {t('aiPrompt.custom')}</em>
            ) : (
              <em className="settings-field-meta">
                {' '}
                {t('aiPrompt.systemDefault')}
              </em>
            )}
          </p>
        </div>

        <label className="auth-field">
          <span>{t('aiPrompt.template')}</span>
          <textarea
            className="cover-prompt-textarea"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setHint(null);
            }}
            rows={14}
            spellCheck={false}
            placeholder={t('aiPrompt.placeholder')}
          />
        </label>

        {data.variables?.length ? (
          <div className="cover-prompt-vars">
            <div className="cover-prompt-vars-title">
              {t('aiPrompt.varsTitle')}
            </div>
            <ul className="cover-prompt-vars-list">
              {data.variables.map((v) => (
                <li key={v.key}>
                  <code
                    role="button"
                    tabIndex={0}
                    title={t('aiPrompt.insert')}
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
              onClick={() => {
                setDraft(data.defaultTemplate);
                setHint(null);
              }}
              disabled={saving}
            >
              {t('aiPrompt.fillDefault')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => void onReset()}
              disabled={saving || !data.isCustom}
            >
              {t('aiPrompt.restoreSave')}
            </button>
          </div>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? t('common.saving') : t('aiPrompt.save')}
          </button>
        </div>
      </div>
    </section>
  );
}

/** 设置页：口播 / 改写 / 闪卡系统提示词 */
export function GlobalAiPromptSettings() {
  const { t } = useI18n();
  const [map, setMap] = useState<Record<AiPromptKind, AiPromptSettings> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAllAiPromptSettings();
      setMap(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="auth-loading">{t('aiPrompt.loading')}</div>;
  }

  if (error || !map) {
    return (
      <div className="settings-stack">
        <div className="settings-inline-error">
          {error || t('aiPrompt.loadFailed')}
        </div>
        <button
          type="button"
          className="nl-btn nl-btn-secondary"
          onClick={() => void load()}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <p className="settings-panel-note">{t('aiPrompt.globalNote')}</p>
      {KINDS.map((kind) => (
        <AiPromptEditor
          key={kind}
          kind={kind}
          data={map[kind]}
          onSaved={(next) =>
            setMap((prev) => (prev ? { ...prev, [kind]: next } : prev))
          }
        />
      ))}
    </div>
  );
}
