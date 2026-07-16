import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTtsSettings, saveTtsSettings } from '../../api/client';
import type { TtsOptions } from '../../types/job';
import { TtsModePicker } from './TtsModePicker';

const DEFAULT_TTS: TtsOptions = {
  mode: 'default',
  voice: '冰糖',
  voiceDesign: '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力',
};

function summarizeTts(tts: TtsOptions): string {
  if (tts.mode === 'voicedesign') {
    const desc = tts.voiceDesign?.trim();
    return desc
      ? `自定义 · ${desc.slice(0, 28)}${desc.length > 28 ? '…' : ''}`
      : '自定义音色';
  }
  const parts = ['自然口播'];
  if (tts.voice) parts.push(String(tts.voice));
  if (tts.styleTags?.length) parts.push(tts.styleTags.join(' '));
  return parts.join(' · ');
}

function ttsMetaChips(tts: TtsOptions): string[] {
  if (tts.mode === 'voicedesign') {
    return ['自定义音色'];
  }
  const chips = [String(tts.voice || '冰糖')];
  if (tts.styleTags?.length) chips.push(...tts.styleTags.slice(0, 4));
  return chips;
}

/** 设置页：全局音色编辑 */
export function GlobalTtsSettings() {
  const [value, setValue] = useState<TtsOptions>(DEFAULT_TTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTtsSettings();
      setValue(data.tts || DEFAULT_TTS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeTts(value), [value]);
  const chips = useMemo(() => ttsMetaChips(value), [value]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedHint(false);
    try {
      const next = await saveTtsSettings(value);
      setValue(next);
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setValue(DEFAULT_TTS);
    setSavedHint(false);
  };

  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-status-bar">
        <div className="settings-status-copy">
          <span className="settings-status-label">当前配置</span>
          <strong className="settings-status-value" title={summary}>
            {summary}
          </strong>
        </div>
        <div className="settings-chip-row" aria-label="音色摘要">
          {chips.map((chip) => (
            <span key={chip} className="settings-chip">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="auth-loading">加载音色…</div>
      ) : (
        <>
          <div className="settings-block">
            <div className="settings-block-head">
              <h3>编辑音色</h3>
              <p>选择模式、预置声线或自定义描述</p>
            </div>
            <TtsModePicker
              value={value}
              onChange={(next) => {
                setValue(next);
                setSavedHint(false);
              }}
            />
          </div>

          {error && <div className="script-prompt-error">{error}</div>}

          <div className="settings-card-actions">
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={onReset}
              disabled={saving}
            >
              恢复默认
            </button>
            <div className="settings-card-actions-right">
              {savedHint && <span className="script-prompt-saved">已保存</span>}
              <button
                type="button"
                className="nl-btn nl-btn-primary"
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? '保存中…' : '保存音色'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export { summarizeTts, DEFAULT_TTS as DEFAULT_GLOBAL_TTS };
