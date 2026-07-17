import type { Locale } from './types.js';
import { isLocale } from './index.js';

export function resolveContentLocale(raw?: string | null): Locale {
  return isLocale(raw) ? raw : 'zh-CN';
}

export function contentLanguageLabel(locale: Locale): string {
  return locale === 'en-US' ? 'English' : '中文';
}

/** 口播时长估算：每分钟大约字符数（去除音频标签后） */
export function spokenCharsPerMinute(locale: Locale): number {
  return locale === 'en-US' ? 750 : 220;
}

/** 口播人设字段标签（注入 system prompt） */
export function scriptPromptFieldLabels(
  locale: Locale,
): Array<{ key: string; label: string }> {
  if (locale === 'en-US') {
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
  return [
    { key: 'hostName', label: '主播称呼' },
    { key: 'hostIdentity', label: '主播身份' },
    { key: 'showName', label: '节目名称' },
    { key: 'speakingStyle', label: '说话风格' },
    { key: 'audience', label: '目标听众' },
    { key: 'tone', label: '语气调性' },
    { key: 'openingStyle', label: '开场偏好' },
    { key: 'closingStyle', label: '收尾偏好' },
    { key: 'maxChars', label: '字数上限' },
    { key: 'extraInstructions', label: '额外要求' },
  ];
}

export function scriptPromptSectionTitle(locale: Locale): string {
  return locale === 'en-US'
    ? '[Host persona & style overrides] (user-defined; higher priority than defaults)'
    : '【口播人设与风格干预】（用户自定义，优先级高于默认设定）';
}

export function buildPodcastSystemPrompt(input: {
  locale: Locale;
  targetMin: number;
  maxChars: number;
  personaSection?: string;
}): string {
  const { locale, targetMin, maxChars, personaSection } = input;
  if (locale === 'en-US') {
    return [
      'You are a senior English podcast producer and editor, also skilled at MiMo-TTS audio tag control.',
      'Rewrite the source transcript into one episode that can be sent directly to TTS.',
      'Requirements:',
      '1. Output strict JSON only. No markdown fences.',
      '2. JSON fields:',
      '   title, summary, tags(string[]), hostIntro, outline({title,summary}[]),',
      '   script, showNotes, estimatedMinutes(number).',
      '3. title should sound like a podcast episode title; summary 80-140 words; tags 3-6 items.',
      '4. script MUST be natural spoken English with opening, mid sections, and closing.',
      `   Spoken length (after removing audio tags) MUST be ${targetMin}-${maxChars} characters, never above ${maxChars}.`,
      '   Exceeding the limit is a failed output. Avoid visual-only phrases like “as shown below” / “click here”.',
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
      '6. showNotes is Markdown with outline and key points; no audio tags in showNotes.',
      '7. Do not invent facts missing from the transcript; you may condense and polish.',
      '8. ALL user-facing fields (title/summary/tags/hostIntro/outline/script/showNotes) MUST be in English.',
      personaSection || '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '你是资深中文播客制作人与内容主编，同时精通 MiMo-TTS 音频标签控制。',
    '请把视频转写稿重构成一集可直接送入 TTS 合成的口播稿。',
    '要求：',
    '1. 输出严格 JSON，不要 markdown 代码围栏。',
    '2. JSON 字段：',
    '   title, summary, tags(string[]), hostIntro, outline({title,summary}[]),',
    '   script, showNotes, estimatedMinutes(number)。',
    '3. title 像播客节目名；summary 80-140 字；tags 3-6 个。',
    '4. script 必须是适合直接口播的口语化中文，包含开场、分段展开、收尾，',
    `   正文字数（去除音频标签后）严格控制在 ${targetMin}-${maxChars} 字，绝对不得超过 ${maxChars} 字；`,
    '   超限属于失败输出。避免“如图所示/点击下方”等视觉依赖表述。',
    '5. script 必须使用 MiMo TTS「音频标签控制」，规则如下（非常重要）：',
    '   - 不支持风格指令（不要写旁白式“请用某某语气朗读”的说明句）。',
    '   - 在全文最开头用半角括号写入 1-2 个整体风格标签，例如：',
    '     (磁性) 或 (沉稳 温柔) 或 (慵懒) 或 (怅然)。',
    '     可选风格示例：磁性/沉稳/温柔/慵懒/怅然/深情/欢快/激昂/清亮/甜美。',
    '   - 在正文关键位置插入细粒度音频标签，使用全角或半角括号均可，例如：',
    '     （深呼吸）（轻笑）（沉默片刻）（语速加快）（小声）（提高音量）（叹气）（哽咽）。',
    '   - 细粒度标签类别：',
    '     · 语速节奏：吸气/深呼吸/叹气/长叹一口气/喘息/屏息/语速加快/沉默片刻',
    '     · 情绪状态：紧张/激动/疲惫/委屈/震惊/不耐烦',
    '     · 语音特征：小声/提高音量/气声/沙哑/颤抖',
    '     · 哭笑表达：轻笑/笑/苦笑/哽咽',
    '   - 标签要克制自然：整篇约 6-12 处细粒度标签即可，不要句句都标。',
    '   - 标签只包裹控制词，不把整句正文塞进标签里。',
    '   - 错误示例：请用磁性声音说… / [用温柔语气]大家好',
    '   - 正确示例：(磁性 沉稳)大家好，欢迎收听。 （深呼吸）先说结论…… （轻笑）我们下期见。',
    '6. showNotes 使用 Markdown，含大纲、要点；showNotes 不要写音频标签。',
    '7. 不要编造转写稿中不存在的事实；可归纳润色。',
    '8. 面向用户的字段（title/summary/tags/hostIntro/outline/script/showNotes）必须使用中文。',
    personaSection || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPodcastUserPrompt(
  locale: Locale,
  sourceTitle: string,
  transcript: string,
): string {
  if (locale === 'en-US') {
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
  if (locale === 'en-US') {
    return [
      'You are a podcast script editor. Compress the given script under the character limit.',
      'Hard rules:',
      `1. Spoken characters after removing audio tags MUST be ≤ ${maxChars} (currently ~${current}).`,
      '2. Keep opening, core points, and closing; drop repetition and low-value expansions.',
      '3. Keep and carefully trim MiMo TTS audio tags (opening style tags + a few fine tags). Style tag tokens stay Chinese.',
      '4. Do not invent facts.',
      '5. Output strict JSON: {"script":"..."} with no markdown.',
      '6. The rewritten script MUST remain in English.',
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
  if (locale === 'en-US') {
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
  if (locale === 'en-US') {
    return {
      title: `[Podcast] ${sourceTitle}`,
      summary: 'A condensed listen-first rewrite of the source material.',
      tags: ['video-to-podcast'],
      hostIntro: 'The host reconstructs the source into a short podcast episode.',
      outlineTitle: 'This episode',
      outlineSummary: 'Key ideas and takeaways',
    };
  }
  return {
    title: `【播客】${sourceTitle}`,
    summary: '本期精华播客。',
    tags: ['视频转播客'],
    hostIntro: '主持人重构视频精华。',
    outlineTitle: '本期内容',
    outlineSummary: '核心观点与建议',
  };
}

export function buildFlashcardSystemPrompt(locale: Locale): string {
  if (locale === 'en-US') {
    return [
      'You are a learning designer creating knowledge flashcards from podcast/video content.',
      'Goal: active recall, not summary dumping.',
      'Requirements:',
      '1. Output strict JSON only. No markdown fences.',
      '2. Shape: { "cards": Flashcard[] }',
      '3. Each card: front, back, hint?(optional), tags?(string[], optional).',
      '4. Generate 8-12 cards covering: core concepts, key conclusions, contrasts, actionable next steps.',
      '5. front is a short English question or concept name (≤40 words); back is complete but concise (40-160 words).',
      '6. Do not invent facts missing from the source; you may condense.',
      '7. No audio tags; do not dump full show notes.',
      '8. Optional tags examples: concept / conclusion / contrast / action / term / case.',
      '9. All card text MUST be in English.',
    ].join('\n');
  }
  return [
    '你是资深知识管理教练与学习设计师，擅长把播客/视频内容做成「知识闪卡」。',
    '目标：帮助用户主动回忆（active recall），而不是抄摘要。',
    '要求：',
    '1. 输出严格 JSON，不要 markdown 代码围栏。',
    '2. JSON 结构：{ "cards": Flashcard[] }',
    '3. 每张卡字段：front, back, hint?(可选), tags?(string[], 可选)。',
    '4. 生成 8-12 张卡，覆盖：核心概念、关键结论、易混对比、可执行行动。',
    '5. front 用简洁中文问句或概念名（≤40 字）；back 给完整但克制的答案（40-160 字）。',
    '6. 不要编造原文没有的事实；可归纳润色。',
    '7. 不要写音频标签；不要输出整段节目笔记。',
    '8. tags 可选值示例：概念 / 结论 / 对比 / 行动 / 术语 / 案例。',
    '9. 所有卡片文案必须使用中文。',
  ].join('\n');
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
  if (locale === 'en-US') {
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
