import type { Locale } from './types.js';
import {
  contentLanguageLabel as registryLanguageLabel,
  contentPromptLanguage,
  resolveContentLocale as resolveFromRegistry,
  spokenCharsPerMinute as registrySpokenCpm,
} from './registry.js';

export function resolveContentLocale(raw?: string | null): Locale {
  return resolveFromRegistry(raw);
}

export function contentLanguageLabel(locale: Locale | string): string {
  return registryLanguageLabel(locale);
}

/** 口播时长估算：每分钟大约字符数（去除音频标签后） */
export function spokenCharsPerMinute(locale: Locale | string): number {
  return registrySpokenCpm(locale);
}

function isZhFamily(locale: Locale): boolean {
  return locale === 'zh-CN' || locale === 'zh-TW';
}

/** 口播人设字段标签（注入 system prompt） */
export function scriptPromptFieldLabels(
  locale: Locale,
): Array<{ key: string; label: string }> {
  if (isZhFamily(locale)) {
    const traditional = locale === 'zh-TW';
    return [
      { key: 'hostName', label: traditional ? '主播稱呼' : '主播称呼' },
      { key: 'hostIdentity', label: '主播身份' },
      { key: 'showName', label: traditional ? '節目名稱' : '节目名称' },
      { key: 'speakingStyle', label: traditional ? '說話風格' : '说话风格' },
      { key: 'audience', label: traditional ? '目標聽眾' : '目标听众' },
      { key: 'tone', label: traditional ? '語氣調性' : '语气调性' },
      { key: 'openingStyle', label: traditional ? '開場偏好' : '开场偏好' },
      { key: 'closingStyle', label: traditional ? '收尾偏好' : '收尾偏好' },
      { key: 'maxChars', label: traditional ? '字數上限' : '字数上限' },
      { key: 'extraInstructions', label: traditional ? '額外要求' : '额外要求' },
    ];
  }
  // 非中文：英文标签（脚手架统一英文，目标语由 promptLanguage 指定）
  return [
    { key: 'hostName', label: 'Host name' },
    { key: 'hostIdentity', label: 'Host role' },
    { key: 'showName', label: 'Show name' },
    { key: 'speakingStyle', label: 'Speaking style' },
    { key: 'audience', label: 'Audience' },
    { key: 'tone', label: 'Tone' },
    { key: 'openingStyle', label: 'Opening preference' },
    { key: 'closingStyle', label: 'Closing preference' },
    { key: 'maxChars', label: 'Max spoken characters' },
    { key: 'extraInstructions', label: 'Extra requirements' },
  ];
}

export function scriptPromptSectionTitle(locale: Locale): string {
  if (isZhFamily(locale)) {
    return locale === 'zh-TW'
      ? '【口播人設與風格干預】（用戶自定義，優先級高於默認設定）'
      : '【口播人设与风格干预】（用户自定义，优先级高于默认设定）';
  }
  return '[Host persona & style overrides] (user-defined; higher priority than defaults)';
}

const MIMO_TAG_RULES_EN = [
  '5. script MUST use MiMo TTS audio tags (critical):',
  '   - No separate style-instruction sentences like “please read in a warm tone”.',
  '   - Put 1-2 global style tags in half-width parentheses at the very beginning, e.g.:',
  '     (磁性) or (沉稳 温柔) or (慵懒). Keep these tag tokens exactly as Chinese control words.',
  '     Style examples: 磁性/沉稳/温柔/慵懒/怅然/深情/欢快/激昂/清亮/甜美.',
  '   - Insert fine-grained tags in the body sparingly, e.g.:',
  '     （深呼吸）（轻笑）（沉默片刻）（语速加快）（小声）（提高音量）（叹气）（哽咽）.',
  '   - Categories: pacing / emotion / voice quality / laugh-cry cues.',
  '   - About 6-12 fine tags total; never tag every sentence.',
  '   - Tags wrap control words only, not full sentences.',
  '   - Good example: (磁性 沉稳)Hello and welcome. （深呼吸）Here is the takeaway… （轻笑）See you next time.',
];

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
];

export function buildPodcastSystemPrompt(input: {
  locale: Locale;
  targetMin: number;
  maxChars: number;
  personaSection?: string;
}): string {
  const loc = resolveContentLocale(input.locale);
  const { targetMin, maxChars, personaSection } = input;
  const lang = contentPromptLanguage(loc);

  if (isZhFamily(loc)) {
    const trad = loc === 'zh-TW';
    const langName = trad ? '繁體中文' : '简体中文';
    return [
      trad
        ? '你是資深中文播客製作人與內容主編，同時精通 MiMo-TTS 音頻標籤控制。'
        : '你是资深中文播客制作人与内容主编，同时精通 MiMo-TTS 音频标签控制。',
      trad
        ? '請把視頻轉寫稿重構成一集可直接送入 TTS 合成的口播稿。'
        : '请把视频转写稿重构成一集可直接送入 TTS 合成的口播稿。',
      '要求：',
      '1. 输出严格 JSON，不要 markdown 代码围栏。',
      '2. JSON 字段：',
      '   title, summary, tags(string[]), hostIntro, outline({title,summary}[]),',
      '   script, showNotes, estimatedMinutes(number)。',
      '3. title 像播客单集标题；summary 80-140 字；tags 3-6 个。',
      `4. script 必须是自然口播${langName}，含开场、中段、收尾。`,
      `   去除音频标签后的口播长度必须在 ${targetMin}-${maxChars} 字之间，不得超过 ${maxChars}。`,
      '   超限视为失败。避免“如下图所示”“点击这里”等视觉向表述。',
      ...MIMO_TAG_RULES_ZH,
      '6. showNotes 为 Markdown 大纲与要点；showNotes 内不要音频标签。',
      '7. 不要编造转写中没有的事实；可以压缩与润色。',
      `8. 所有面向用户的字段（title/summary/tags/hostIntro/outline/script/showNotes）必须使用${langName}。`,
      personaSection || '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // en-US 与其它内容语言：英文脚手架 + 目标语约束，新增语言只需注册表
  return [
    `CRITICAL: The entire podcast output MUST be written in ${lang}.`,
    `If the source transcript is in another language, translate and rewrite into natural spoken ${lang}.`,
    `Do NOT output Simplified Chinese, Traditional Chinese, or any other language except ${lang} (MiMo TTS control tags may stay as Chinese tokens).`,
    `You are a senior ${lang} podcast producer and editor, also skilled at MiMo-TTS audio tag control.`,
    'Rewrite the source transcript into one episode that can be sent directly to TTS.',
    'Requirements:',
    '1. Output strict JSON only. No markdown fences.',
    '2. JSON fields:',
    '   title, summary, tags(string[]), hostIntro, outline({title,summary}[]),',
    '   script, showNotes, estimatedMinutes(number).',
    '3. title should sound like a podcast episode title; summary 80-140 words; tags 3-6 items.',
    `4. script MUST be natural spoken ${lang} with opening, mid sections, and closing.`,
    `   Spoken length (after removing audio tags) MUST be ${targetMin}-${maxChars} characters, never above ${maxChars}.`,
    '   Exceeding the limit is a failed output. Avoid visual-only phrases like “as shown below” / “click here”.',
    ...MIMO_TAG_RULES_EN,
    '6. showNotes is Markdown with outline and key points; no audio tags in showNotes.',
    '7. Do not invent facts missing from the transcript; you may condense and polish.',
    `8. ALL user-facing fields (title/summary/tags/hostIntro/outline/script/showNotes) MUST be in ${lang}.`,
    personaSection || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildFlashcardSystemPrompt(locale: Locale): string {
  const loc = resolveContentLocale(locale);
  const lang = contentPromptLanguage(loc);
  if (isZhFamily(loc)) {
    const langName = loc === 'zh-TW' ? '繁體中文' : '简体中文';
    return [
      '你是学习科学专家，擅长把播客内容做成主动回忆闪卡。',
      '根据口播稿与笔记生成 JSON 对象（不是数组根节点）。',
      '要求：',
      '1. 只输出一个 JSON 对象，不要 markdown、不要 NDJSON、不要解释文字。',
      '2. 顶层格式必须是：{"cards":[...]}。',
      '3. 每张卡：{"id":"string","front":"...","back":"...","tags"?: string[],"hint"?: string}。',
      '4. front 是问题/概念；back 是简明答案；字段名用英文 front/back。',
      '5. 6-12 张卡，覆盖概念、结论、行动建议；全部放在 cards 数组里。',
      '6. 不要编造原文没有的事实。',
      `7. front/back/hint/tags 全部使用${langName}。`,
    ].join('\n');
  }
  return [
    `You are a learning-science expert who turns podcasts into active-recall flashcards in ${lang}.`,
    'Generate a JSON object of flashcards from the script and notes (not a root array).',
    'Requirements:',
    '1. Output one JSON object only. No markdown, no NDJSON, no prose.',
    '2. Top-level shape MUST be: {"cards":[...]}.',
    '3. Each card: {"id":"string","front":"...","back":"...","tags"?: string[],"hint"?: string}.',
    '4. front is a question/concept; back is a concise answer; use English keys front/back.',
    '5. 6-12 cards covering concepts, conclusions, and actions; put them all in cards.',
    '6. Do not invent facts missing from the source.',
    `7. front/back/hint/tags MUST all be in ${lang}.`,
  ].join('\n');
}

export function demoHostName(locale: Locale): string {
  return isZhFamily(resolveContentLocale(locale)) ? '主持人' : 'the host';
}

export function demoFallbackTitle(locale: Locale, sourceTitle: string): string {
  const base = sourceTitle.replace(/\.[^.]+$/, '');
  if (base) return base;
  return isZhFamily(resolveContentLocale(locale)) ? '视频精华' : 'Source highlights';
}

export function buildPodcastUserPrompt(
  locale: Locale,
  sourceTitle: string,
  transcript: string,
): string {
  if (!isZhFamily(locale)) {
    return [
      `Source filename: ${sourceTitle}`,
      '',
      'Transcript / source text:',
      transcript,
    ].join('\n');
  }
  return [`视频文件名：${sourceTitle}`, '', '转写稿：', transcript].join('\n');
}

export function buildRewriteSystemPrompt(
  locale: Locale,
  maxChars: number,
  current: number,
): string {
  if (!isZhFamily(locale)) {
    return [
      'You are a podcast script editor. Compress the given script under the character limit.',
      'Hard rules:',
      `1. Spoken characters after removing audio tags MUST be ≤ ${maxChars} (currently ~${current}).`,
      '2. Keep opening, core points, and closing; drop repetition and low-value expansions.',
      '3. Keep and carefully trim MiMo TTS audio tags (opening style tags + a few fine tags). Style tag tokens stay Chinese.',
      '4. Do not invent facts.',
      '5. Output strict JSON: {"script":"..."} with no markdown.',
      '6. The rewritten script MUST remain in the same language as the input script.',
    ].join('\n');
  }
  return [
    '你是播客口播编辑。任务：把给定 script 压缩到字数上限内。',
    '硬性要求：',
    `1. 去除音频标签后的正文字数必须 ≤ ${maxChars} 字（当前约 ${current} 字）。`,
    '2. 保留开场、核心观点、收尾；删除重复与次要展开。',
    '3. 保留并合理精简 MiMo TTS 音频标签（开头风格标签 + 若干细粒度标签）。',
    '4. 不要编造新事实。',
    '5. 输出严格 JSON：{"script":"..."}，不要 markdown。',
    '6. 改写后的 script 必须仍是中文口播。',
  ].join('\n');
}

export function buildRewriteUserPrompt(
  locale: Locale,
  input: { title: string; sourceTitle: string; maxChars: number; script: string },
): string {
  if (!isZhFamily(locale)) {
    return [
      `Episode title: ${input.title}`,
      `Source: ${input.sourceTitle}`,
      `Character limit: ${input.maxChars}`,
      '',
      'Original script:',
      input.script,
    ].join('\n');
  }
  return [
    `节目标题：${input.title}`,
    `来源：${input.sourceTitle}`,
    `字数上限：${input.maxChars}`,
    '',
    '原 script：',
    input.script,
  ].join('\n');
}

export function podcastFallbackCopy(
  locale: Locale,
  sourceTitle: string,
): {
  title: string;
  summary: string;
  tags: string[];
  hostIntro: string;
  outlineTitle: string;
  outlineSummary: string;
} {
  if (!isZhFamily(locale)) {
    return {
      title: `[Podcast] ${sourceTitle}`,
      summary: 'A condensed listen-first rewrite of the source material.',
      tags: ['content-to-podcast'],
      hostIntro: 'The host turns the source into a concise private podcast episode.',
      outlineTitle: 'This episode',
      outlineSummary: 'Key ideas and takeaways',
    };
  }
  return {
    title: `【播客】${sourceTitle}`,
    summary: '本期精华播客。',
    tags: ['内容转播客'],
    hostIntro: '主持人将源内容重构为可收听的精华口播。',
    outlineTitle: '本期内容',
    outlineSummary: '核心观点与建议',
  };
}

export function buildFlashcardUserContext(
  locale: Locale,
  input: {
    sourceTitle: string;
    title?: string;
    summary?: string;
    tags?: string[];
    outlineText?: string;
    showNotes?: string;
    transcript: string;
  },
): string {
  if (!isZhFamily(locale)) {
    return [
      `Source title: ${input.sourceTitle}`,
      input.title ? `Episode title: ${input.title}` : '',
      input.summary ? `Summary: ${input.summary}` : '',
      input.tags?.length ? `Tags: ${input.tags.join(', ')}` : '',
      input.outlineText ? `Outline:\n${input.outlineText}` : '',
      input.showNotes
        ? `Show notes (reference, do not copy):\n${input.showNotes.slice(0, 2500)}`
        : '',
      '',
      'Transcript / source text (primary):',
      input.transcript.slice(0, 12000),
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `素材标题：${input.sourceTitle}`,
    input.title ? `节目名：${input.title}` : '',
    input.summary ? `摘要：${input.summary}` : '',
    input.tags?.length ? `标签：${input.tags.join('、')}` : '',
    input.outlineText ? `大纲：\n${input.outlineText}` : '',
    input.showNotes
      ? `节目笔记（参考，勿照抄）：\n${input.showNotes.slice(0, 2500)}`
      : '',
    '',
    '转写/原文（主依据）：',
    input.transcript.slice(0, 12000),
  ]
    .filter(Boolean)
    .join('\n');
}
