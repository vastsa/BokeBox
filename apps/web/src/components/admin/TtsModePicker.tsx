import { useState } from 'react';
import type { PresetVoiceId, TtsMode, TtsOptions } from '../../types/job';

const MODES: Array<{ id: TtsMode; title: string; desc: string }> = [
  { id: 'default', title: '自然口播', desc: '预置音色' },
  { id: 'voicedesign', title: '自定义音色', desc: '自然语言描述' },
];

/** mimo-v2.5-tts 预置精品音色（与官方文档一致） */
export const PRESET_VOICES: Array<{
  id: PresetVoiceId;
  name: string;
  language: string;
  gender: string;
  description?: string;
}> = [
  {
    id: 'mimo_default',
    name: 'MiMo-默认',
    language: '自适应',
    gender: '-',
    description: '中国集群=冰糖',
  },
  { id: '冰糖', name: '冰糖', language: '中文', gender: '女性' },
  { id: '茉莉', name: '茉莉', language: '中文', gender: '女性' },
  { id: '苏打', name: '苏打', language: '中文', gender: '男性' },
  { id: '白桦', name: '白桦', language: '中文', gender: '男性' },
  { id: 'Mia', name: 'Mia', language: '英文', gender: '女性' },
  { id: 'Chloe', name: 'Chloe', language: '英文', gender: '女性' },
  { id: 'Milo', name: 'Milo', language: '英文', gender: '男性' },
  { id: 'Dean', name: 'Dean', language: '英文', gender: '男性' },
];

export const DEFAULT_PRESET_VOICE: PresetVoiceId = '冰糖';

/**
 * 自然口播 · 开头风格标签（写入 assistant 开头）
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
              <div className="title">{m.title}</div>
              <div className="desc">{m.desc}</div>
            </button>
          );
        })}
      </div>

      {showPreset && (
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-[var(--text-2)]">
            预置音色
          </div>
          <div className="tts-voice-grid">
            {PRESET_VOICES.map((v) => {
              const active = currentVoice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange({ ...value, voice: v.id })}
                  className={['tts-voice', active ? 'is-active' : ''].join(' ')}
                  title={v.description || `${v.language} · ${v.gender}`}
                >
                  <div className="name">{v.name}</div>
                  <div className="meta">
                    {v.language}
                    {v.gender !== '-' ? ` · ${v.gender}` : ''}
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
            开头风格
            <span className="ml-1 font-normal text-[var(--text-3)]">可选</span>
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
              预览：
              <code>({styleTags.join(' ')}) 大家好，欢迎收听…</code>
            </div>
          )}

          <button
            type="button"
            className="tts-tips-toggle"
            onClick={() => setShowTips((v) => !v)}
            aria-expanded={showTips}
          >
            {showTips ? '收起说明' : '标签用法说明'}
          </button>

          {showTips && (
            <div className="tts-sing-tip">
              <ul>
                <li>
                  整体风格写在文本最开头：
                  <code>(磁性)</code> <code>(沉稳 温柔)</code>
                </li>
                <li>不支持 user 侧「风格指令」，只靠文本内标签控制语气</li>
                <li>
                  口播稿生成时会自动插入细粒度标签，例如：
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
            音色描述
          </div>
          <textarea
            value={value.voiceDesign || ''}
            onChange={(e) => onChange({ ...value, voiceDesign: e.target.value })}
            rows={3}
            placeholder="例如：温柔成熟的女性播客主持人，声线清晰，语速适中，有亲和力"
            className="nl-textarea"
          />
          <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
            Voice Design 不支持预置音色与音频风格标签
          </div>
        </label>
      )}
    </div>
  );
}
