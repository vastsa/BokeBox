import { useEffect, useMemo, useState } from 'react';
import type { TtsMode, TtsOptions } from '../../types/job';
import { fetchAiPlugins, type AiPluginDescriptor } from '../../api/plugins';
import {
  defaultVoiceForProvider,
  isMimoTtsProvider,
  normalizeTtsProviderId,
  resolveTtsVoiceProfile,
  type TtsVoiceProfile,
} from '../../lib/ttsVoiceProfile';
import { useI18n } from '../../i18n';
import { navigate } from '../../lib/router';

const MODES: Array<{ id: TtsMode; titleKey: string; descKey: string }> = [
  { id: 'default', titleKey: 'tts.modeDefault', descKey: 'tts.modeDefaultDesc' },
  { id: 'voicedesign', titleKey: 'tts.modeCustom', descKey: 'tts.modeCustomDesc' },
];

/**
 * 自然口播风格标签（写入 assistant 开头）
 * 文档「音频标签控制」——仅 MiMo / supportsStyleTags
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

/** @deprecated 请用 lib/ttsVoiceProfile */
export { defaultVoiceForProvider, isMimoTtsProvider };

export const DEFAULT_PRESET_VOICE = '冰糖';

/** 兼容旧导入 */
export const PRESET_VOICES = [
  { id: 'mimo_default', nameKey: 'tts.mimoDefault', languageKey: 'tts.langAuto' },
  { id: '冰糖', name: '冰糖', languageKey: 'tts.langZh', genderKey: 'tts.genderFemale' },
  { id: '茉莉', name: '茉莉', languageKey: 'tts.langZh', genderKey: 'tts.genderFemale' },
  { id: '苏打', name: '苏打', languageKey: 'tts.langZh', genderKey: 'tts.genderMale' },
  { id: '白桦', name: '白桦', languageKey: 'tts.langZh', genderKey: 'tts.genderMale' },
  { id: 'Mia', name: 'Mia', languageKey: 'tts.langEn', genderKey: 'tts.genderFemale' },
  { id: 'Chloe', name: 'Chloe', languageKey: 'tts.langEn', genderKey: 'tts.genderFemale' },
  { id: 'Milo', name: 'Milo', languageKey: 'tts.langEn', genderKey: 'tts.genderMale' },
  { id: 'Dean', name: 'Dean', languageKey: 'tts.langEn', genderKey: 'tts.genderMale' },
] as const;

function clampTtsForProfile(
  value: TtsOptions,
  profile: TtsVoiceProfile,
): TtsOptions {
  if (profile.supportsVoiceDesign) {
    // MiMo：保留 mode / style / design
    return value;
  }

  if (profile.voiceUi === 'preset') {
    const allowed = new Set(profile.voices.map((v) => v.id));
    const voice =
      value.voice && allowed.has(String(value.voice))
        ? String(value.voice)
        : profile.defaultVoice;
    return {
      mode: 'default',
      voice,
      voiceDesign: undefined,
      styleTags: undefined,
    };
  }

  if (profile.voiceUi === 'reference' || profile.voiceUi === 'freeform') {
    const raw = value.voice ? String(value.voice).trim() : '';
    // 切换自 MiMo/OpenAI/Edge 时丢掉其预置名，避免把「冰糖」当成 reference_id
    const foreign = new Set([
      'mimo_default',
      '冰糖',
      '茉莉',
      '苏打',
      '白桦',
      'Mia',
      'Chloe',
      'Milo',
      'Dean',
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'onyx',
      'nova',
      'sage',
      'shimmer',
      'verse',
    ]);
    const looksEdge = /^zh-CN-|^en-[A-Z]{2}-/i.test(raw);
    const voice = raw && !foreign.has(raw) && !looksEdge ? raw : '';
    return {
      mode: 'default',
      // 允许空：表示走插件默认 referenceId
      voice,
      voiceDesign: undefined,
      styleTags: undefined,
    };
  }

  // none
  return {
    mode: 'default',
    voice: undefined,
    voiceDesign: undefined,
    styleTags: undefined,
  };
}

function needsClamp(value: TtsOptions, profile: TtsVoiceProfile): boolean {
  if (profile.supportsVoiceDesign) {
    // 仅在 mode 合法时不夹；voicedesign 时清掉 style 等由 UI 保证
    return false;
  }
  const clamped = clampTtsForProfile(value, profile);
  return (
    value.mode !== clamped.mode ||
    String(value.voice || '') !== String(clamped.voice || '') ||
    Boolean(value.voiceDesign) ||
    Boolean(value.styleTags?.length)
  );
}

function providerHintKey(profile: TtsVoiceProfile): string {
  if (profile.supportsVoiceDesign) return '';
  if (profile.voiceUi === 'reference') return 'tts.refVoiceHint';
  if (profile.voiceUi === 'freeform') return 'tts.freeformVoiceHint';
  if (profile.voiceUi === 'preset') return 'tts.basicOnlyHint';
  return 'tts.basicOnlyHint';
}

export function TtsModePicker({
  value,
  onChange,
  provider = 'mimo',
  plugin: pluginProp,
}: {
  value: TtsOptions;
  onChange: (next: TtsOptions) => void;
  /** 当前 TTS 提供方 id */
  provider?: string;
  /** 可选：外部已拉到的插件描述符，避免重复请求 */
  plugin?: AiPluginDescriptor | null;
}) {
  const { t } = useI18n();
  const [showTips, setShowTips] = useState(false);
  const [plugin, setPlugin] = useState<AiPluginDescriptor | null>(
    pluginProp ?? null,
  );
  const [pluginLoading, setPluginLoading] = useState(!pluginProp);

  const providerId = normalizeTtsProviderId(provider);

  useEffect(() => {
    if (pluginProp !== undefined) {
      setPlugin(pluginProp);
      setPluginLoading(false);
      return;
    }
    let cancelled = false;
    setPluginLoading(true);
    void fetchAiPlugins('tts')
      .then((res) => {
        if (cancelled) return;
        const hit =
          res.plugins.find((p) => p.id === providerId) ||
          res.plugins.find(
            (p) => p.id.toLowerCase() === providerId.toLowerCase(),
          ) ||
          null;
        setPlugin(hit);
      })
      .catch(() => {
        if (!cancelled) setPlugin(null);
      })
      .finally(() => {
        if (!cancelled) setPluginLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, pluginProp]);

  const profile = useMemo(
    () => resolveTtsVoiceProfile(providerId, plugin),
    [providerId, plugin],
  );

  // 切换提供方时收敛非法字段
  useEffect(() => {
    if (pluginLoading) return;
    if (!needsClamp(value, profile)) return;
    onChange(clampTtsForProfile(value, profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pluginLoading,
    profile.providerId,
    profile.voiceUi,
    profile.supportsVoiceDesign,
    value.mode,
    value.voice,
    value.voiceDesign,
    value.styleTags,
  ]);

  const advanced = profile.supportsVoiceDesign;
  const styleTags = value.styleTags || [];
  const currentVoice = String(value.voice || profile.defaultVoice || '');
  const showPreset = advanced ? value.mode === 'default' : true;
  const hintKey = providerHintKey(profile);
  const effectiveRef =
    String(value.voice || '').trim() ||
    profile.pluginDefaultReferenceId ||
    '';

  return (
    <div className="space-y-2.5">
      {!advanced && hintKey && (
        <div className="auth-tip">
          <span>{t(hintKey)}</span>
        </div>
      )}

      {pluginLoading && (
        <div className="text-[var(--fs-xs)] text-[var(--text-3)]">
          {t('tts.loadingProviderMeta')}
        </div>
      )}

      {/* 提供方能力摘要 */}
      <div className="tts-provider-chip" aria-label={t('tts.providerMetaAria')}>
        <span className="tts-provider-chip-name">{profile.providerName}</span>
        <span className="tts-provider-chip-ui">
          {profile.voiceUi === 'reference'
            ? t('tts.uiKindReference')
            : profile.voiceUi === 'freeform'
              ? t('tts.uiKindFreeform')
              : profile.voiceUi === 'none'
                ? t('tts.uiKindNone')
                : t('tts.uiKindPreset')}
        </span>
      </div>

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
                        : value.voice || profile.defaultVoice || DEFAULT_PRESET_VOICE,
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

      {/* 预置音色网格 */}
      {showPreset && profile.voiceUi === 'preset' && (
        <div>
          <div className="mb-1.5 text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.presetVoices')}
          </div>
          <div className="tts-voice-grid">
            {profile.voices.map((v) => {
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
                  title={v.title || `${v.name}${v.meta ? ` · ${v.meta}` : ''}`}
                >
                  <div className="name">{v.name}</div>
                  {v.meta ? <div className="meta">{v.meta}</div> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fish Speech 等：reference_id 面板 */}
      {showPreset && profile.voiceUi === 'reference' && (
        <div className="tts-ref-panel">
          <label className="mb-1.5 block text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.refVoiceId')}
          </label>
          <input
            type="text"
            className="nl-input"
            value={value.voice || ''}
            onChange={(e) =>
              onChange({
                ...value,
                mode: 'default',
                voice: e.target.value.trimStart(),
                voiceDesign: undefined,
                styleTags: undefined,
              })
            }
            placeholder={t('tts.refVoiceIdPlaceholder')}
            spellCheck={false}
            autoComplete="off"
          />

          <div className="tts-ref-meta">
            <div className="tts-ref-meta-row">
              <span className="label">{t('tts.refEffective')}</span>
              <span className="value" title={effectiveRef || t('tts.refMissing')}>
                {effectiveRef || t('tts.refMissing')}
              </span>
            </div>
            <div className="tts-ref-meta-row">
              <span className="label">{t('tts.refPluginDefault')}</span>
              <span className="value">
                {profile.pluginDefaultReferenceId || t('common.notFilled')}
              </span>
            </div>
          </div>

          <div className="tts-ref-actions">
            {profile.pluginDefaultReferenceId ? (
              <button
                type="button"
                className="nl-btn nl-btn-secondary"
                onClick={() =>
                  onChange({
                    ...value,
                    mode: 'default',
                    voice: profile.pluginDefaultReferenceId,
                    voiceDesign: undefined,
                    styleTags: undefined,
                  })
                }
              >
                {t('tts.refUsePluginDefault')}
              </button>
            ) : null}
            {String(value.voice || '').trim() ? (
              <button
                type="button"
                className="nl-btn nl-btn-secondary"
                onClick={() =>
                  onChange({
                    ...value,
                    mode: 'default',
                    voice: '',
                    voiceDesign: undefined,
                    styleTags: undefined,
                  })
                }
              >
                {t('tts.refClearOverride')}
              </button>
            ) : null}
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => navigate({ name: 'settings' })}
            >
              {t('tts.refOpenPluginSettings')}
            </button>
          </div>

          <p className="tts-ref-help">{t('tts.refVoiceHelp')}</p>
        </div>
      )}

      {/* 通用自由文本音色 */}
      {showPreset && profile.voiceUi === 'freeform' && (
        <div>
          <label className="mb-1.5 block text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.externalVoiceId')}
          </label>
          <input
            type="text"
            className="nl-input"
            value={value.voice || ''}
            onChange={(e) =>
              onChange({
                ...value,
                mode: 'default',
                voice: e.target.value,
                voiceDesign: undefined,
                styleTags: undefined,
              })
            }
            placeholder={t('tts.externalVoiceIdPlaceholder')}
            spellCheck={false}
            autoComplete="off"
          />
          <p className="mt-1 text-[var(--fs-xs)] text-[var(--text-3)]">
            {t('tts.externalVoiceIdHint')}
          </p>
        </div>
      )}

      {profile.voiceUi === 'none' && (
        <div className="auth-tip">
          <span>{t('tts.noneVoiceHint')}</span>
        </div>
      )}

      {advanced && value.mode === 'default' && profile.supportsStyleTags && (
        <div className="tts-sing-panel">
          <div className="mb-1.5 text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.styleTags')}
            <span className="ml-1 font-normal text-[var(--text-3)]">
              {t('common.optional')}
            </span>
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
            <div className="mt-2 text-[var(--fs-xs)] text-[var(--text-3)]">
              {t('tts.preview')}
              <code className="ml-1">
                ({styleTags.join(' ')}) {t('tts.previewSample')}
              </code>
            </div>
          )}

          <button
            type="button"
            className="mt-2 text-[var(--fs-xs)] text-[var(--brand-2)]"
            onClick={() => setShowTips((v) => !v)}
          >
            {showTips ? t('tts.tipsHide') : t('tts.tipsShow')}
          </button>
          {showTips && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--fs-xs)] text-[var(--text-3)]">
              <li>{t('tts.tipsLine1')}</li>
              <li>{t('tts.tipsLine2')}</li>
              <li>
                {t('tts.tipsLine3')} {AUDIO_TAG_HINTS.join(' / ')}
              </li>
            </ul>
          )}
        </div>
      )}

      {advanced && value.mode === 'voicedesign' && (
        <div>
          <label className="mb-1.5 block text-[var(--fs-sm-plus)] font-medium text-[var(--text-2)]">
            {t('tts.voiceDesc')}
          </label>
          <textarea
            className="nl-input"
            rows={3}
            value={value.voiceDesign || ''}
            onChange={(e) => onChange({ ...value, voiceDesign: e.target.value })}
            placeholder={t('tts.voiceDescPlaceholder')}
          />
          <p className="mt-1 text-[var(--fs-xs)] text-[var(--text-3)]">
            {t('tts.voiceDesignNote')}
          </p>
        </div>
      )}
    </div>
  );
}
