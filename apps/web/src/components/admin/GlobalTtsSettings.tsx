import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAiSettings,
  fetchTtsSettings,
  saveTtsSettings,
} from '../../api/client';
import { fetchAiPlugins, type AiPluginDescriptor } from '../../api/plugins';
import type { TtsOptions } from '../../types/job';
import {
  defaultVoiceForProvider,
  formatTtsVoiceLabel,
  resolveTtsVoiceProfile,
} from '../../lib/ttsVoiceProfile';
import { TtsModePicker } from './TtsModePicker';
import { tOutside, useI18n } from '../../i18n';
import { PageLoader } from '../ui/PageLoader';

const DEFAULT_TTS: TtsOptions = {
  mode: 'default',
  voice: '冰糖',
  voiceDesign: '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力',
};

function summarizeTts(
  tts: TtsOptions,
  profile?: ReturnType<typeof resolveTtsVoiceProfile> | null,
): string {
  const p = profile || resolveTtsVoiceProfile('mimo', null);
  if (tts.mode === 'voicedesign' && p.supportsVoiceDesign) {
    const desc = tts.voiceDesign?.trim();
    return desc
      ? tOutside('tts.customSummary', {
          desc: `${desc.slice(0, 28)}${desc.length > 28 ? '…' : ''}`,
        })
      : tOutside('tts.customVoice');
  }
  if (tts.mode === 'voiceclone') {
    const ref = tts.voice?.trim();
    return ref
      ? `${tOutside('tts.modeClone')} · ${ref.length > 28 ? `${ref.slice(0, 28)}…` : ref}`
      : tOutside('tts.modeClone');
  }
  const parts = [
    p.voiceUi === 'reference'
      ? tOutside('tts.modeReferenceShort')
      : tOutside('tts.modeDefault'),
  ];
  parts.push(
    formatTtsVoiceLabel(
      tts.voice,
      p,
      tOutside('tts.refPluginDefaultShort'),
    ),
  );
  if (p.supportsStyleTags && tts.styleTags?.length) {
    parts.push(tts.styleTags.join(' '));
  }
  return parts.join(' · ');
}

/** 设置页：全局音色编辑 */
export function GlobalTtsSettings() {
  const { t } = useI18n();
  const [value, setValue] = useState<TtsOptions>(DEFAULT_TTS);
  const [ttsProvider, setTtsProvider] = useState('mimo');
  const [plugin, setPlugin] = useState<AiPluginDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const profile = useMemo(
    () => resolveTtsVoiceProfile(ttsProvider, plugin),
    [ttsProvider, plugin],
  );
  const advanced = profile.supportsVoiceDesign;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ttsData, ai, pluginsRes] = await Promise.all([
        fetchTtsSettings(),
        fetchAiSettings().catch(() => null),
        fetchAiPlugins('tts').catch(() => null),
      ]);
      const provider = ai?.tts?.provider || ai?.ttsProvider || 'mimo';
      setTtsProvider(provider);
      const hit =
        pluginsRes?.plugins.find((p) => p.id === provider) ||
        pluginsRes?.plugins.find(
          (p) => p.id.toLowerCase() === String(provider).toLowerCase(),
        ) ||
        null;
      setPlugin(hit);
      const nextProfile = resolveTtsVoiceProfile(provider, hit);
      setValue(
        ttsData.tts || {
          ...DEFAULT_TTS,
          voice: defaultVoiceForProvider(provider, hit),
          mode: 'default',
          ...(nextProfile.supportsVoiceDesign
            ? {}
            : { voiceDesign: undefined, styleTags: undefined }),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeTts(value, profile), [value, profile]);
  const modeLabel =
    value.mode === 'voicedesign' && advanced
      ? tOutside('tts.modeCustom')
      : profile.voiceUi === 'reference'
        ? tOutside('tts.modeReferenceShort')
        : tOutside('tts.modeDefault');
  const voiceLabel =
    value.mode === 'voicedesign' && advanced
      ? value.voiceDesign?.trim() || tOutside('tts.noDesc')
      : formatTtsVoiceLabel(
          value.voice,
          profile,
          tOutside('tts.refPluginDefaultShort'),
        );
  const styleLabel =
    advanced && value.mode === 'default' && value.styleTags?.length
      ? value.styleTags.join('、')
      : tOutside('common.none');

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
    setValue({
      mode: 'default',
      voice: defaultVoiceForProvider(ttsProvider, plugin),
      voiceDesign: advanced
        ? DEFAULT_TTS.voiceDesign
        : undefined,
      styleTags: undefined,
    });
    setSavedHint(false);
  };

  const editDesc = plugin?.voicePanel
    ? t('tts.editDescPluginPanel')
    : profile.voiceUi === 'reference'
      ? t('tts.editDescReference')
      : advanced
        ? t('tts.editDesc')
        : t('tts.editDescBasic');

  return (
    <section className="settings-card settings-card-wide">
      <dl className="settings-meta-list" aria-label={t('tts.metaAria')}>
        <div className="settings-meta-row">
          <dt>{t('tts.metaSummary')}</dt>
          <dd title={summary}>{summary}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>{t('tts.metaProvider')}</dt>
          <dd>{profile.providerName}</dd>
        </div>
        {advanced && (
          <div className="settings-meta-row">
            <dt>{t('tts.metaMode')}</dt>
            <dd>{modeLabel}</dd>
          </div>
        )}
        <div className="settings-meta-row">
          <dt>
            {value.mode === 'voicedesign' && advanced
              ? t('tts.metaDesc')
              : profile.voiceUi === 'reference'
                ? t('tts.refVoiceId')
                : t('tts.labelVoice')}
          </dt>
          <dd title={voiceLabel}>{voiceLabel}</dd>
        </div>
        {advanced && value.mode === 'default' && (
          <div className="settings-meta-row">
            <dt>{t('tts.labelStyle')}</dt>
            <dd>{styleLabel}</dd>
          </div>
        )}
      </dl>

      {loading ? (
        <PageLoader label={t('tts.loading')} variant="block" />
      ) : (
        <>
          <div className="settings-block">
            <div className="settings-block-head">
              <h3>{t('tts.editTitle')}</h3>
              <p>{editDesc}</p>
            </div>
            <TtsModePicker
              value={value}
              provider={ttsProvider}
              plugin={plugin}
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
              {t('tts.restoreDefaults')}
            </button>
            <div className="settings-card-actions-right">
              {savedHint && (
                <span className="script-prompt-saved">{t('common.saved')}</span>
              )}
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

export { summarizeTts, DEFAULT_TTS as DEFAULT_GLOBAL_TTS };
