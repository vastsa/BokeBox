/**
 * 可后台配置的 AI 系统提示词（口播 / 压缩改写 / 闪卡）。
 * 未自定义时回落 contentLocale 内置的多语言逻辑。
 */
import type { Locale } from '../i18n/types.js';
import {
  buildFlashcardSystemPrompt,
  buildPodcastSystemPrompt,
  buildRewriteSystemPrompt,
  contentLanguageLabel,
  resolveContentLocale,
} from '../i18n/contentLocale.js';
import { contentPromptLanguage } from '../i18n/registry.js';
import {
  getAiPromptTemplateStored,
  setAiPromptTemplateStored,
  type AiPromptKind,
} from './settingsStore.js';

export type { AiPromptKind };

export type PromptVariable = {
  key: string;
  label: string;
  sample: string;
};

export type AiPromptBundle = {
  kind: AiPromptKind;
  template: string;
  stored: string;
  defaultTemplate: string;
  isCustom: boolean;
  variables: PromptVariable[];
};

/** 渲染 {{var}} 模板 */
export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  const rendered = String(template || '').replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => {
      const v = vars[key];
      return v == null ? '' : String(v);
    },
  );
  return rendered
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MIMO_TAG_RULES_ZH = [
  '5. script 必须使用 MiMo TTS 音频标签（关键）：',
  '   - 不要写“请用温柔语气朗读”这类独立风格说明句。',
  '   - 在文稿最开头用半角括号放 1-2 个全局风格标签，例如：',
  '     (磁性) 或 (沉稳 温柔) 或 (慵懒)。标签控制词保持中文原文，不要翻译。',
  '     风格示例：磁性/沉稳/温柔/慵懒/怅然/深情/欢快/激昂/清亮/甜美。',
  '   - 正文中少量插入细粒度标签，例如：',
  '     （深呼吸）（轻笑）（沉默片刻）（语速加快）（小声）（提高音量）（叹气）（哽咽）。',
  '   - 类别：节奏 / 情绪 / 音色 / 笑哭等提示。',
  '   - 全文约 6-12 个细标签；不要每句都打。',
  '   - 括号内只放控制词，不要包整句。',
  '   - 正例：(磁性 沉稳)大家好。 （深呼吸）今天重点是… （轻笑）我们下期见。',
].join('\n');

/** 口播系统提示词默认模板（含变量；自定义后对所有内容语言生效） */
export const DEFAULT_PODCAST_SYSTEM_PROMPT = [
  '你是资深播客制作人与内容主编，同时精通 MiMo-TTS 音频标签控制。',
  '请把视频转写稿重构成一集可直接送入 TTS 合成的口播稿。',
  '要求：',
  '1. 输出严格 JSON，不要 markdown 代码围栏。',
  '2. JSON 字段：',
  '   title, summary, tags(string[]), hostIntro, outline({title,summary}[]),',
  '   script, showNotes, estimatedMinutes(number)。',
  '3. title 像播客单集标题；summary 80-140 字；tags 3-6 个。',
  '4. script 必须是自然口播{{language}}，含开场、中段、收尾。',
  '   去除音频标签后的口播长度必须在 {{targetMin}}-{{maxChars}} 字之间，不得超过 {{maxChars}}。',
  '   超限视为失败。避免“如下图所示”“点击这里”等视觉向表述。',
  MIMO_TAG_RULES_ZH,
  '6. showNotes 为 Markdown 大纲与要点；showNotes 内不要音频标签。',
  '7. 不要编造转写中没有的事实；可以压缩与润色。',
  '8. 所有面向用户的字段（title/summary/tags/hostIntro/outline/script/showNotes）必须使用{{language}}。',
  '{{personaSection}}',
].join('\n');

export const DEFAULT_REWRITE_SYSTEM_PROMPT = [
  '你是播客口播编辑。任务：把给定 script 压缩到字数上限内。',
  '硬性要求：',
  '1. 去除音频标签后的正文字数必须 ≤ {{maxChars}} 字（当前约 {{current}} 字）。',
  '2. 保留开场、核心观点、收尾；删除重复与次要展开。',
  '3. 保留并合理精简 MiMo TTS 音频标签（开头风格标签 + 若干细粒度标签）。',
  '4. 不要编造新事实。',
  '5. 输出严格 JSON：{"script":"..."}，不要 markdown。',
  '6. 改写后的 script 必须仍是{{language}}口播。',
].join('\n');

export const DEFAULT_FLASHCARD_SYSTEM_PROMPT = [
  '你是学习科学专家，擅长把播客内容做成主动回忆闪卡。',
  '根据口播稿与笔记生成 JSON 闪卡数组。',
  '要求：',
  '1. 只输出 JSON 数组，不要 markdown。',
  '2. 每张卡：{ id, front, back, tags?: string[], hint?: string }。',
  '3. front 是问题/概念；back 是简明答案。',
  '4. 6-12 张卡，覆盖概念、结论、行动建议。',
  '5. 不要编造原文没有的事实。',
  '6. front/back/hint/tags 全部使用{{language}}。',
].join('\n');

export const PODCAST_SYSTEM_VARIABLES: PromptVariable[] = [
  { key: 'language', label: '内容语言名称', sample: '简体中文' },
  { key: 'targetMin', label: '口播字数下限', sample: '1200' },
  { key: 'maxChars', label: '口播字数上限', sample: '1600' },
  {
    key: 'personaSection',
    label: '口播人设段落（由人设设置注入）',
    sample: '【口播人设与风格干预】…',
  },
];

export const REWRITE_SYSTEM_VARIABLES: PromptVariable[] = [
  { key: 'language', label: '内容语言名称', sample: '简体中文' },
  { key: 'maxChars', label: '字数上限', sample: '1600' },
  { key: 'current', label: '当前正文字数', sample: '2100' },
];

export const FLASHCARD_SYSTEM_VARIABLES: PromptVariable[] = [
  { key: 'language', label: '内容语言名称', sample: '简体中文' },
];

const DEFAULTS: Record<
  AiPromptKind,
  { defaultTemplate: string; variables: PromptVariable[] }
> = {
  podcastSystem: {
    defaultTemplate: DEFAULT_PODCAST_SYSTEM_PROMPT,
    variables: PODCAST_SYSTEM_VARIABLES,
  },
  rewriteSystem: {
    defaultTemplate: DEFAULT_REWRITE_SYSTEM_PROMPT,
    variables: REWRITE_SYSTEM_VARIABLES,
  },
  flashcardSystem: {
    defaultTemplate: DEFAULT_FLASHCARD_SYSTEM_PROMPT,
    variables: FLASHCARD_SYSTEM_VARIABLES,
  },
};

export function getDefaultAiPromptTemplate(kind: AiPromptKind): string {
  return DEFAULTS[kind].defaultTemplate;
}

export function getAiPromptVariables(kind: AiPromptKind): PromptVariable[] {
  return DEFAULTS[kind].variables;
}

export function getAiPromptBundle(kind: AiPromptKind): AiPromptBundle {
  const stored = getAiPromptTemplateStored(kind);
  const defaultTemplate = getDefaultAiPromptTemplate(kind);
  return {
    kind,
    template: stored || defaultTemplate,
    stored,
    defaultTemplate,
    isCustom: Boolean(stored),
    variables: getAiPromptVariables(kind),
  };
}

export function getAllAiPromptBundles(): Record<AiPromptKind, AiPromptBundle> {
  return {
    podcastSystem: getAiPromptBundle('podcastSystem'),
    rewriteSystem: getAiPromptBundle('rewriteSystem'),
    flashcardSystem: getAiPromptBundle('flashcardSystem'),
  };
}

export function saveAiPromptTemplate(
  kind: AiPromptKind,
  input: { template?: string | null; reset?: boolean },
): AiPromptBundle {
  const defaultTemplate = getDefaultAiPromptTemplate(kind);
  const reset = Boolean(input.reset);
  const incoming = String(input.template ?? '').trim();
  const stored =
    reset || incoming === defaultTemplate.trim()
      ? setAiPromptTemplateStored(kind, '')
      : setAiPromptTemplateStored(kind, input.template);
  return getAiPromptBundle(kind);
}

function languageLabel(locale: Locale): string {
  const loc = resolveContentLocale(locale);
  if (loc === 'zh-CN') return '简体中文';
  if (loc === 'zh-TW') return '繁體中文';
  return contentPromptLanguage(loc) || contentLanguageLabel(loc);
}

/** 运行时：口播 system prompt（自定义优先，否则多语言内置） */
export function resolvePodcastSystemPrompt(input: {
  locale: Locale;
  targetMin: number;
  maxChars: number;
  personaSection?: string;
}): string {
  const stored = getAiPromptTemplateStored('podcastSystem');
  if (stored) {
    return renderPromptTemplate(stored, {
      language: languageLabel(input.locale),
      targetMin: input.targetMin,
      maxChars: input.maxChars,
      personaSection: input.personaSection || '',
    });
  }
  return buildPodcastSystemPrompt(input);
}

/** 运行时：压缩改写 system prompt */
export function resolveRewriteSystemPrompt(
  locale: Locale,
  maxChars: number,
  current: number,
): string {
  const stored = getAiPromptTemplateStored('rewriteSystem');
  if (stored) {
    return renderPromptTemplate(stored, {
      language: languageLabel(locale),
      maxChars,
      current,
    });
  }
  return buildRewriteSystemPrompt(locale, maxChars, current);
}

/** 运行时：闪卡 system prompt */
export function resolveFlashcardSystemPrompt(locale: Locale): string {
  const stored = getAiPromptTemplateStored('flashcardSystem');
  if (stored) {
    return renderPromptTemplate(stored, {
      language: languageLabel(locale),
    });
  }
  return buildFlashcardSystemPrompt(locale);
}
