import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCoverPromptSettings,
  saveCoverPromptSettings,
  type CoverPromptSettings,
} from '../../api/client';

/** 设置页：全局封面提示词模板 */
export function GlobalCoverPromptSettings() {
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
      setHint(next.isCustom ? '封面提示词已保存' : '已回落系统默认模板');
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
      setHint('已恢复系统默认封面提示词');
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
    return <div className="auth-loading">加载封面提示词…</div>;
  }

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-block">
        <div className="settings-block-head">
          <h3>封面提示词</h3>
          <p>
            生成 AI 封面时使用的模板。留空变量会渲染为空字符串。
            {data?.isCustom ? (
              <em className="settings-field-meta"> 自定义中</em>
            ) : (
              <em className="settings-field-meta"> 系统默认</em>
            )}
          </p>
        </div>

        <label className="auth-field">
          <span>提示词模板</span>
          <textarea
            className="cover-prompt-textarea"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setHint(null);
            }}
            rows={18}
            spellCheck={false}
            placeholder="使用 {{title}} {{summary}} 等变量…"
          />
        </label>

        {data?.variables?.length ? (
          <div className="cover-prompt-vars">
            <div className="cover-prompt-vars-title">可用变量</div>
            <ul className="cover-prompt-vars-list">
              {data.variables.map((v) => (
                <li key={v.key}>
                  <code
                    role="button"
                    tabIndex={0}
                    title="点击插入"
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
              填入默认
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => void onReset()}
              disabled={saving || !data?.isCustom}
            >
              恢复默认并保存
            </button>
          </div>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? '保存中…' : '保存封面提示词'}
          </button>
        </div>
      </div>
    </section>
  );
}
