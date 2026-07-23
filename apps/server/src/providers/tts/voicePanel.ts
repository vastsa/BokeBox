/**
 * 将插件 meta 解析为最终 voicePanel。
 * - 优先使用插件声明的 meta.voicePanel
 * - 否则把旧 voiceUi 简写编译成 panel（兼容）
 * - 再否则按 voices / supports* 兜底
 */
import type {
  TtsProviderMeta,
  TtsVoicePanelField,
  TtsVoicePanelSpec,
  TtsVoiceUi,
} from './types.js';

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

function asVoiceUi(raw: unknown): TtsVoiceUi | undefined {
  const s = String(raw || '').trim();
  if (s === 'preset' || s === 'reference' || s === 'freeform' || s === 'none') {
    return s;
  }
  return undefined;
}

function sanitizePanel(raw: unknown): TtsVoicePanelSpec | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as { version?: unknown; title?: unknown; description?: unknown; fields?: unknown };
  if (!Array.isArray(obj.fields) || !obj.fields.length) return undefined;
  const fields: TtsVoicePanelField[] = [];
  for (const item of obj.fields) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const type = String((item as { type?: unknown }).type || '').trim();
    if (!type) continue;
    // 结构信任插件作者；运行时渲染器再做字段级校验
    fields.push(item as TtsVoicePanelField);
  }
  if (!fields.length) return undefined;
  return {
    version: 1,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    fields,
  };
}

/** 旧 voiceUi → 声明式 panel */
export function compileVoicePanelFromUi(
  meta: Pick<
    TtsProviderMeta,
    | 'voiceUi'
    | 'voices'
    | 'modes'
    | 'supportsStyleTags'
    | 'supportsVoiceDesign'
    | 'voiceConfigKey'
  >,
): TtsVoicePanelSpec {
  const ui =
    asVoiceUi(meta.voiceUi) ||
    (meta.supportsVoiceDesign
      ? 'preset'
      : meta.voices?.length
        ? 'preset'
        : 'freeform');

  if (ui === 'none') {
    return {
      version: 1,
      fields: [
        {
          type: 'info',
          text: '当前提供方无需选择音色。',
        },
      ],
    };
  }

  if (ui === 'reference') {
    return {
      version: 1,
      description: '音色由 reference_id 决定；可覆盖插件默认配置。',
      fields: [
        {
          type: 'text',
          bind: 'voice',
          label: '音色 reference_id',
          placeholder: '粘贴音色模型 id；留空则用插件默认',
          description:
            '克隆/音色库类提供方使用 reference_id。任务级填写会覆盖插件默认。',
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
          placeholder: '按插件文档填写音色 id',
        },
        { type: 'effectiveSummary' },
        {
          type: 'actions',
          items: ['usePluginDefault', 'clearOverride', 'openPluginSettings'],
        },
      ],
    };
  }

  // preset（可叠加 modeTabs / tags / voicedesign）
  const fields: TtsVoicePanelField[] = [];
  if (meta.supportsVoiceDesign) {
    fields.push({
      type: 'modeTabs',
      options: (meta.modes || []).map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
      })),
    });
  }
  fields.push({
    type: 'voiceGrid',
    options: (meta.voices || []).map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      description: v.description,
    })),
    when: meta.supportsVoiceDesign ? { mode: 'default' } : undefined,
  });
  if (meta.supportsStyleTags) {
    fields.push({
      type: 'tags',
      bind: 'styleTags',
      label: '风格底色',
      optional: true,
      options: [...MIMO_STYLE_TAGS],
      when: { mode: 'default' },
    });
  }
  if (meta.supportsVoiceDesign) {
    fields.push({
      type: 'textarea',
      bind: 'voiceDesign',
      label: '音色描述',
      rows: 3,
      placeholder: '例如：温柔成熟的中文播客主持人，声线清晰，语速适中',
      description: 'Voice Design 不支持预置音色与风格标签',
      when: { mode: 'voicedesign' },
    });
  }
  return { version: 1, fields };
}

/** 解析最终面板：插件自定义优先 */
export function resolveVoicePanel(meta: TtsProviderMeta): TtsVoicePanelSpec {
  const custom = sanitizePanel(meta.voicePanel);
  if (custom) return custom;
  return compileVoicePanelFromUi(meta);
}
