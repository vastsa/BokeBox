import { useState } from 'react';
import type { PresetVoiceId, TtsMode, TtsOptions } from '../../types/job';
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

export function TtsModePicker({
  value,
  onChange,
}: {
  value: TtsOptions;
  onChange: (next: TtsOptions) => void;
}) {
  const { t } = useI18n();
  const [showTips, setShowTips] = useState(false);
  const currentVoice = (value.voice || DEFAULT_PRESET_VOICE) as string;
  const showPreset = value.mode === 'default';
  const styleTags = value.styleTags || [];

  return (
    <div className="space-y-2.5">
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
                  styleTags: m.id === 'voicedesign' ? undefined : value.styleTags,
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

      {showPreset && (
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-[var(--text-2)]">
            {t('tts.presetVoices')}
          </div>
          <div className="tts-voice-grid">
            {PRESET_VOICES.map((v) => {
              const active = currentVoice === v.id;
              const name = v.nameKey ? t(v.nameKey) : (v.name || v.id);
              const language = t(v.languageKey);
              const gender = v.genderKey ? t(v.genderKey) : (v.gender || '-');
              const desc = v.descriptionKey ? t(v.descriptionKey) : `${language} · ${gender}`;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange({ ...value, voice: v.id })}
                  className={['tts-voice', active ? 'is-active' : ''].join(' ')}
                  title={desc}
                >
                  <div className="name">{name}</div>
                  <div className="meta">
                    {language}
                    {gender !== '-' ? ` · ${gender}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.mode === 'default' && (
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
                    onChange({ ...value, styleTags: toggleTag(value.styleTags, tag) })
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
              <code>({styleTags.join(' ')}) {t('tts.previewSample')}</code>
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
                  {AUDIO_TAG_HINTS.map((t) => (
                    <code key={t} className="mx-0.5">
                      （{t}）
                    </code>
                  ))}
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {value.mode === 'voicedesign' && (
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
