import { useEffect, useMemo, useState } from 'react';
import type { TtsOptions } from '../../types/job';
import { fetchAiPlugins, type AiPluginDescriptor } from '../../api/plugins';
import {
  defaultVoiceForProvider,
  isMimoTtsProvider,
  normalizeTtsProviderId,
  resolveTtsVoiceProfile,
  type TtsVoiceProfile,
} from '../../lib/ttsVoiceProfile';
import { resolvePluginVoicePanel, panelHasType } from '../../lib/ttsVoicePanel';
import { TtsPluginVoicePanel } from './TtsPluginVoicePanel';
import { useI18n } from '../../i18n';

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

/**
 * 按插件面板能力收敛 TtsOptions，避免残留其它提供方字段
 */
function clampTtsForPanel(
  value: TtsOptions,
  plugin: AiPluginDescriptor | null,
  profile: TtsVoiceProfile,
): TtsOptions {
  const panel = resolvePluginVoicePanel(plugin);
  const hasModeTabs = panelHasType(panel, 'modeTabs');
  const hasTags = panelHasType(panel, 'tags');
  const hasVoiceDesign = panel.fields.some(
    (f) =>
      (f.type === 'text' || f.type === 'textarea' || f.type === 'select') &&
      f.bind === 'voiceDesign',
  );
  const hasVoiceGrid = panelHasType(panel, 'voiceGrid');

  if (hasModeTabs || hasVoiceDesign) {
    // 支持高级模式的面板：尽量保留
    if (value.mode === 'voicedesign' && hasVoiceDesign) {
      return {
        mode: 'voicedesign',
        voice: value.voice,
        voiceDesign: value.voiceDesign,
        styleTags: undefined,
      };
    }
    if (value.mode === 'voiceclone') {
      return {
        mode: 'voiceclone',
        // 参考音频路径 / data URI，不强制落入预置网格
        voice: value.voice ? String(value.voice) : '',
        voiceDesign: undefined,
        styleTags: undefined,
      };
    }
    let voice = value.voice ? String(value.voice) : profile.defaultVoice;
    if (hasVoiceGrid && profile.voices.length) {
      const allowed = new Set(profile.voices.map((v) => v.id));
      if (voice && !allowed.has(voice)) voice = profile.defaultVoice;
    }
    return {
      mode: 'default',
      voice,
      voiceDesign: undefined,
      styleTags: hasTags ? value.styleTags : undefined,
    };
  }

  // 纯文本 / reference / freeform：保留任意 voice 字符串，清空高级字段
  // 若从预置提供方切来，丢掉已知预置名
  const raw = value.voice ? String(value.voice).trim() : '';
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
  let voice = raw;
  if (hasVoiceGrid && profile.voices.length) {
    const allowed = new Set(profile.voices.map((v) => v.id));
    voice = raw && allowed.has(raw) ? raw : profile.defaultVoice;
  } else if (raw && (foreign.has(raw) || looksEdge) && !hasVoiceGrid) {
    // 非网格面板：清空其它提供方预置名
    voice = '';
  }

  return {
    mode: 'default',
    voice,
    voiceDesign: undefined,
    styleTags: undefined,
  };
}

function needsClamp(
  value: TtsOptions,
  plugin: AiPluginDescriptor | null,
  profile: TtsVoiceProfile,
): boolean {
  const clamped = clampTtsForPanel(value, plugin, profile);
  return (
    value.mode !== clamped.mode ||
    String(value.voice || '') !== String(clamped.voice || '') ||
    String(value.voiceDesign || '') !== String(clamped.voiceDesign || '') ||
    JSON.stringify(value.styleTags || []) !==
      JSON.stringify(clamped.styleTags || [])
  );
}

/**
 * 音色选择器宿主壳：
 * - 拉取当前 TTS 插件描述符
 * - 用插件 voicePanel 通用渲染（不固定业务页面）
 */
export function TtsModePicker({
  value,
  onChange,
  provider = 'mimo',
  plugin: pluginProp,
}: {
  value: TtsOptions;
  onChange: (next: TtsOptions) => void;
  provider?: string;
  plugin?: AiPluginDescriptor | null;
}) {
  const { t } = useI18n();
  const [plugin, setPlugin] = useState<AiPluginDescriptor | null>(
    pluginProp ?? null,
  );
  const [pluginLoading, setPluginLoading] = useState(pluginProp === undefined);

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
  const panel = useMemo(() => resolvePluginVoicePanel(plugin), [plugin]);

  useEffect(() => {
    if (pluginLoading) return;
    if (!needsClamp(value, plugin, profile)) return;
    onChange(clampTtsForPanel(value, plugin, profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pluginLoading,
    profile.providerId,
    panel,
    value.mode,
    value.voice,
    value.voiceDesign,
    value.styleTags,
  ]);

  return (
    <div className="space-y-2.5">
      <div className="tts-provider-chip" aria-label={t('tts.providerMetaAria')}>
        <span className="tts-provider-chip-name">
          {plugin?.name || profile.providerName}
        </span>
        <span className="tts-provider-chip-ui">
          {plugin?.voicePanel
            ? t('tts.uiKindPluginPanel')
            : profile.voiceUi === 'reference'
              ? t('tts.uiKindReference')
              : profile.voiceUi === 'freeform'
                ? t('tts.uiKindFreeform')
                : profile.voiceUi === 'none'
                  ? t('tts.uiKindNone')
                  : t('tts.uiKindPreset')}
        </span>
      </div>

      {pluginLoading ? (
        <div className="text-[var(--fs-xs)] text-[var(--text-3)]">
          {t('tts.loadingProviderMeta')}
        </div>
      ) : (
        <TtsPluginVoicePanel
          value={value}
          onChange={onChange}
          plugin={plugin}
          panel={panel}
        />
      )}
    </div>
  );
}
