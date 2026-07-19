/**
 * 前端：解析 / 兼容编译插件音色面板
 * 优先 plugin.voicePanel；否则由 voiceUi / voices 生成（兼容旧插件）
 */
import type {
  AiPluginDescriptor,
  TtsVoicePanelField,
  TtsVoicePanelSpec,
  TtsVoiceUi,
} from '../api/plugins';

const MIMO_STYLE_TAGS = [
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
];

function asUi(raw: unknown): TtsVoiceUi | undefined {
  const s = String(raw || '').trim();
  if (s === 'preset' || s === 'reference' || s === 'freeform' || s === 'none') {
    return s;
  }
  return undefined;
}

function compileFromLegacy(plugin?: AiPluginDescriptor | null): TtsVoicePanelSpec {
  const ui =
    asUi(plugin?.voiceUi) ||
    (plugin?.supportsVoiceDesign
      ? 'preset'
      : plugin?.voices?.length
        ? 'preset'
        : 'freeform');

  if (ui === 'none') {
    return {
      version: 1,
      fields: [{ type: 'info', text: '当前提供方无需选择音色。' }],
    };
  }
  if (ui === 'reference') {
    return {
      version: 1,
      fields: [
        {
          type: 'text',
          bind: 'voice',
          label: '音色 reference_id',
          placeholder: '粘贴音色模型 id；留空则用插件默认',
        },
        { type: 'effectiveSummary' },
        {
          type: 'actions',
          items: ['usePluginDefault', 'clearOverride', 'openPluginSettings'],
        },
      ],
    };
  }
  if (ui === 'freeform') {
    return {
      version: 1,
      fields: [
        {
          type: 'text',
          bind: 'voice',
          label: '音色 ID',
          placeholder: '按插件文档填写',
        },
        { type: 'effectiveSummary' },
        {
          type: 'actions',
          items: ['usePluginDefault', 'clearOverride', 'openPluginSettings'],
        },
      ],
    };
  }

  const fields: TtsVoicePanelField[] = [];
  if (plugin?.supportsVoiceDesign) {
    fields.push({
      type: 'modeTabs',
      options: (plugin.modes || []).map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
      })),
    });
  }
  fields.push({
    type: 'voiceGrid',
    options: (plugin?.voices || []).map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      description: v.description,
    })),
    when: plugin?.supportsVoiceDesign ? { mode: 'default' } : undefined,
  });
  if (plugin?.supportsStyleTags) {
    fields.push({
      type: 'tags',
      bind: 'styleTags',
      label: '开头风格',
      optional: true,
      options: [...MIMO_STYLE_TAGS],
      when: { mode: 'default' },
    });
  }
  if (plugin?.supportsVoiceDesign) {
    fields.push({
      type: 'textarea',
      bind: 'voiceDesign',
      label: '音色描述',
      rows: 3,
      placeholder: '用自然语言描述你想要的音色',
      when: { mode: 'voicedesign' },
    });
  }
  return { version: 1, fields };
}

export function resolvePluginVoicePanel(
  plugin?: AiPluginDescriptor | null,
): TtsVoicePanelSpec {
  const custom = plugin?.voicePanel;
  if (custom && Array.isArray(custom.fields) && custom.fields.length) {
    return custom;
  }
  return compileFromLegacy(plugin);
}

/** 面板是否包含某种字段类型 */
export function panelHasType(
  panel: TtsVoicePanelSpec,
  type: TtsVoicePanelField['type'],
): boolean {
  return (panel.fields || []).some((f) => f.type === type);
}
