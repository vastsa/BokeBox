import { useEffect, useMemo, useState } from 'react';
import type { PresetVoiceId, TtsMode, TtsOptions } from '../../types/job';
import {
  EDGE_VOICE_OPTIONS,
  OPENAI_VOICE_OPTIONS,
} from '../../lib/providerOptions';
import { useI18n } from '../../i18n';

const MODES: Array<{ id: TtsMode; titleKey: string; descKey: string }> = [
  { id: 'default', titleKey: 'tts.modeDefault', descKey: 'tts.modeDefaultDesc' },
  { id: 'voicedesign', titleKey: 'tts.modeCustom', descKey: 'tts.modeCustomDesc' },
];

/** mimo-v2.5-tts 预置精品音色（与官方文档一致） */
export const PRESET_VOICES: Array<{
  id: PresetVoiceId;
  name?: string;
  nameKey?: string;
  languageKey: string;
  genderKey?: string;
  gender?: string;
  descriptionKey?: string;
}> = [
  {
    id: 'mimo_default',
    nameKey: 'tts.mimoDefault',
    languageKey: 'tts.langAuto',
    gender: '-',
    descriptionKey: 'tts.mimoDefaultDesc',
  },
  { id: '冰糖', name: '冰糖', languageKey: 'tts.langZh', genderKey: 'tts.genderFemale' },
  { id: '茉莉', name: '茉莉', languageKey: 'tts.langZh', genderKey: 'tts.genderFemale' },
  { id: '苏打', name: '苏打', languageKey: 'tts.langZh', genderKey: 'tts.genderMale' },
  { id: '白桦', name: '白桦', languageKey: 'tts.langZh', genderKey: 'tts.genderMale' },
  { id: 'Mia', name: 'Mia', languageKey: 'tts.langEn', genderKey: 'tts.genderFemale' },
  { id: 'Chloe', name: 'Chloe', languageKey: 'tts.langEn', genderKey: 'tts.genderFemale' },
  { id: 'Milo', name: 'Milo', languageKey: 'tts.langEn', genderKey: 'tts.genderMale' },
  { id: 'Dean', name: 'Dean', languageKey: 'tts.langEn', genderKey: 'tts.genderMale' },
];

export const DEFAULT_PRESET_VOICE: PresetVoiceId = '冰糖';

/**
 * 自然口播风格标签（写入 assistant 开头）
 * 文档「音频标签控制」
 */
const SPEECH_STYLE_TAGS = [
  '磁性',
  '沉稳',
  '温柔',
  '慵懒',
  '怅然',
  '深情',
  '欢快',
  '激昂',
  '清亮',
  '甜美',
  '东北话',
  '粤语',
] as const;

/** 正文细粒度音频标签提示 */
const AUDIO_TAG_HINTS = [
  '深呼吸',
  '轻笑',
  '叹气',
  '语速加快',
  '小声',
  '沉默片刻',
  '提高音量',
  '哽咽',
] as const;

function toggleTag(list: string[] | undefined, tag: string): string[] {
  const cur = list || [];
  return cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
}

function normalizeProviderId(provider?: string): string {
  return String(provider || 'mimo').trim().toLowerCase() || 'mimo';
}

/** 仅 MiMo 支持 VoiceDesign / 风格标签等高级能力 */
export function isMimoTtsProvider(provider?: string): boolean {
  return normalizeProviderId(provider) === 'mimo';
}

export function defaultVoiceForProvider(provider?: string): string {
  const id = normalizeProviderId(provider);
  if (id === 'edge') return 'zh-CN-XiaoxiaoNeural';
  if (id === 'openai') return 'alloy';
  return DEFAULT_PRESET_VOICE;
}

type VoiceOption = {
  id: string;
  name: string;
  meta: string;
  title?: string;
};

function voiceOptionsForProvider(
  provider: string,
  t: (key: string) => string,
): VoiceOption[] {
  if (provider === 'edge') {
    return EDGE_VOICE_OPTIONS.map((v) => ({
      id: v.id,
      name: v.name,
      meta: v.language,
      title: `${v.name} · ${v.language}`,
    }));
  }
  if (provider === 'openai') {
    return OPENAI_VOICE_OPTIONS.map((v) => ({
      id: v.id,
      name: v.name,
      meta: v.language,
      title: `${v.name} · ${v.language}`,
    }));
  }
  return PRESET_VOICES.map((v) => {
    const name = v.nameKey ? t(v.nameKey) : v.name || v.id;
    const language = t(v.languageKey);
    const gender = v.genderKey ? t(v.genderKey) : v.gender || '-';
    const desc = v.descriptionKey
      ? t(v.descriptionKey)
      : `${language} · ${gender}`;
    return {
      id: v.id,
      name,
      meta: gender !== '-' ? `${language} · ${gender}` : language,
      title: desc,
    };
  });
}

function clampTtsForProvider(value: TtsOptions, provider: string): TtsOptions {
  if (isMimoTtsProvider(provider)) return value;

  const voices = voiceOptionsForProvider(provider, (k) => k);
  const allowed = new Set(voices.map((v) => v.id));
  const fallback = defaultVoiceForProvider(provider);
  const voice =
    value.voice && allowed.has(String(value.voice))
      ? String(value.voice)
      : fallback;

  return {
    mode: 'default',
    voice,
    voiceDesign: undefined,
    styleTags: undefined,
  };
}

function needsClamp(value: TtsOptions, provider: string): boolean {
  if (isMimoTtsProvider(provider)) return false;
  const clamped = clampTtsForProvider(value, provider);
  return (
    value.mode !== clamped.mode ||
    String(value.voice || '') !== String(clamped.voice || '') ||
    Boolean(value.voiceDesign) ||
    Boolean(value.styleTags?.length)
  );
}

export function TtsModePicker({
  value,
  onChange,
  provider = 'mimo',
}: {
  value: TtsOptions;
  onChange: (next: TtsOptions) => void;
  /** 当前 TTS 提供方；非 mimo 时仅展示基础音色 */
  provider?: string;
}) {
  const { t } = useI18n();
  const [showTips, setShowTips] = useState(false);
  const providerId = normalizeProviderId(provider);
  const advanced = isMimoTtsProvider(providerId);
  const voiceOptions = useMemo(
    () => voiceOptionsForProvider(providerId, t),
    [providerId, t],
  );

  // 切换到非 MiMo 时自动收敛高级字段，避免旧配置残留
  useEffect(() => {
    if (!needsClamp(value, providerId)) return;
    onChange(clampTtsForProvider(value, providerId));
    // 仅响应提供方/非法字段；避免跟 onChange 循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, value.mode, value.voice, value.voiceDesign, value.styleTags]);

  const currentVoice = String(
    value.voice || defaultVoiceForProvider(providerId),
  );
  const showPreset = advanced ? value.mode === 'default' : true;
  const styleTags = value.styleTags || [];

  return (
    <div className="space-y-2.5">
      {!advanced && (
        <div className="auth-tip">
          <span>{t('tts.basicOnlyHint')}</span>
        </div>
      )}

      {advanced && (
        <div className="tts-mode-grid">
          {MODES.map((m) => {
            const active = value.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    mode: m.id,
                    voice:
                      m.id === 'voicedesign'
                        ? value.voice
                        : value.voice || DEFAULT_PRESET_VOICE,
                    styleTags:
                      m.id === 'voicedesign' ? undefined : value.styleTags,
                  })
                }
                className={['tts-mode', active ? 'is-active' : ''].join(' ')}
              >
                <div className="title">{t(m.titleKey)}</div>
                <div className="desc">{t(m.descKey)}</div>
              </button>
            );
          })}
        </div>
      )}

      {showPreset && (
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-[var(--text-2)]">
            {t('tts.presetVoices')}
          </div>
          <div className="tts-voice-grid">
            {voiceOptions.map((v) => {
              const active = currentVoice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      mode: 'default',
                      voice: v.id,
                      ...(advanced
                        ? {}
                        : { voiceDesign: undefined, styleTags: undefined }),
                    })
                  }
                  className={['tts-voice', active ? 'is-active' : ''].join(' ')}
                  title={v.title || `${v.name} · ${v.meta}`}
                >
                  <div className="name">{v.name}</div>
                  <div className="meta">{v.meta}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {advanced && value.mode === 'default' && (
        <div className="tts-sing-panel">
          <div className="mb-1.5 text-[11.5px] font-medium text-[var(--text-2)]">
            {t('tts.styleTags')}
            <span className="ml-1 font-normal text-[var(--text-3)]">{t('common.optional')}</span>
          </div>

          <div className="tts-tag-grid">
            {SPEECH_STYLE_TAGS.map((tag) => {
              const active = styleTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={['tts-tag', active ? 'is-active' : ''].join(' ')}
                  onClick={() =>
                    onChange({
                      ...value,
                      styleTags: toggleTag(value.styleTags, tag),
                    })
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {styleTags.length > 0 && (
            <div className="tts-sing-preview">
              {t('tts.preview')}
              <code>
                ({styleTags.join(' ')}) {t('tts.previewSample')}
              </code>
            </div>
          )}

          <button
            type="button"
            className="tts-tips-toggle"
            onClick={() => setShowTips((v) => !v)}
            aria-expanded={showTips}
          >
            {showTips ? t('tts.tipsHide') : t('tts.tipsShow')}
          </button>

          {showTips && (
            <div className="tts-sing-tip">
              <ul>
                <li>
                  {t('tts.tipsLine1')}
                  <code>(磁性)</code> <code>(沉稳 温柔)</code>
                </li>
                <li>{t('tts.tipsLine2')}</li>
                <li>
                  {t('tts.tipsLine3')}
                  {AUDIO_TAG_HINTS.map((hint) => (
                    <code key={hint} className="mx-0.5">
                      （{hint}）
                    </code>
                  ))}
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {advanced && value.mode === 'voicedesign' && (
        <label className="block">
          <div className="mb-1.5 text-[11.5px] font-medium text-[var(--text-2)]">
            {t('tts.voiceDesc')}
          </div>
          <textarea
            value={value.voiceDesign || ''}
            onChange={(e) => onChange({ ...value, voiceDesign: e.target.value })}
            rows={3}
            placeholder={t('tts.voiceDescPlaceholder')}
            className="nl-textarea"
          />
          <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
            {t('tts.voiceDesignNote')}
          </div>
        </label>
      )}
    </div>
  );
}
