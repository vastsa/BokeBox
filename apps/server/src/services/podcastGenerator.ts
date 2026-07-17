import { writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import type { PodcastContent, ScriptPromptOptions } from '../types/job.js';
import { aiFetch, getChatModel, hasApiKey } from '../utils/aiConfig.js';
import {
  buildScriptPromptSection,
  countSpokenChars,
  hasScriptPrompt,
  resolveScriptMaxChars,
} from './scriptPrompt.js';
import type { Locale } from '../i18n/types.js';
import {
  buildPodcastSystemPrompt,
  buildPodcastUserPrompt,
  demoHostName,
  buildRewriteSystemPrompt,
  buildRewriteUserPrompt,
  podcastFallbackCopy,
  resolveContentLocale,
  spokenCharsPerMinute,
} from '../i18n/contentLocale.js';

const GRADIENTS = [
  'from-[#7eb0ff] via-[#4f8ef7] to-[#3b7aef]',
  'from-[#a5b4fc] via-[#818cf8] to-[#4f46e5]',
  'from-[#5eead4] via-[#14b8a6] to-[#0f766e]',
  'from-[#f9a8d4] via-[#f472b6] to-[#db2777]',
  'from-[#fbbf24] via-[#f59e0b] to-[#d97706]',
  'from-[#c4b5fd] via-[#8b5cf6] to-[#6d28d9]',
  'from-[#7dd3fc] via-[#38bdf8] to-[#0284c7]',
  'from-[#fca5a5] via-[#f87171] to-[#dc2626]',
  'from-[#1a1a2e] via-[#16213e] to-[#0f3460]',
  'from-[#2b1055] via-[#7597de] to-[#1b1b2f]',
  'from-[#0f2027] via-[#203a43] to-[#2c5364]',
  'from-[#3a1c71] via-[#d76d77] to-[#ffaf7b]',
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/**
 * 口播稿内嵌音频标签规范（MiMo TTS 音频标签控制）
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 * - 开头风格：`(磁性)` `(沉稳)` `(慵懒)` …
 * - 正文细粒度：`（深呼吸）` `（轻笑）` `（沉默片刻）` `（语速加快）` …
 * - 不支持 user 侧自然语言「风格指令」，只能靠文本内标签
 */
function buildDemoHostIntro(
  scriptPrompt?: ScriptPromptOptions,
  locale: Locale = 'zh-CN',
): string {
  if (!hasScriptPrompt(scriptPrompt)) {
    return locale === 'en-US'
      ? 'The host reconstructs the source into a commute-friendly highlight podcast.'
      : '主持人将原视频内容重构成一档通勤向精华播客。';
  }
  const name =
    scriptPrompt?.hostName || (locale === 'en-US' ? 'the host' : '主持人');
  const identity = scriptPrompt?.hostIdentity
    ? locale === 'en-US'
      ? ` (${scriptPrompt.hostIdentity})`
      : `（${scriptPrompt.hostIdentity}）`
    : '';
  const show = scriptPrompt?.showName
    ? locale === 'en-US'
      ? `"${scriptPrompt.showName}"`
      : `《${scriptPrompt.showName}》`
    : locale === 'en-US'
      ? 'this episode'
      : '本期节目';
  return locale === 'en-US'
    ? `${name}${identity} reframes the source from the ${show} perspective into a commute-friendly highlight podcast.`
    : `${name}${identity} 以${show}视角，将原视频内容重构成一档通勤向精华播客。`;
}

function demoPodcast(
  transcript: string,
  sourceTitle: string,
  scriptPrompt?: ScriptPromptOptions,
  locale: Locale = 'zh-CN',
): PodcastContent {
  const base = sourceTitle.replace(/\.[^.]+$/, '') || (locale === 'en-US' ? 'Source highlights' : '视频精华');
  if (locale === 'en-US') {
    const title = `[Podcast] ${base}: From source to a listen-first episode`;
    const summary =
      'This episode rewrites the source into about 10 minutes of highlight listening, with key ideas and practical next steps.';
    const tags = ['video-to-podcast', 'repurposing', 'spoken script', 'personal brand'];
    const outline = [
      { title: 'Opening hook', summary: 'Why rewrite the source as a podcast.' },
      { title: 'Core ideas', summary: 'Three to five memorable points.' },
      { title: 'Practical advice', summary: 'Actionable next steps for listeners.' },
      { title: 'Closing note', summary: 'Recap and teaser for next time.' },
    ];
    const highlights = transcript
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6);
    const script = [
      '(磁性 沉稳)Hello, welcome to this episode.',
      `Today we focus on "${base}" and compress the source into a more finishable highlight version.`,
      '',
      '（深呼吸）Bottom line first: a good podcast is not a verbatim read of the source. Rebuild the rhythm—hook early, keep only high-value points, end with action.',
      '',
      'Part one, positioning.',
      'Video is great for demos; audio is great for companionship and depth. Turning the source into a podcast covers driving, walking, and chores.',
      '',
      'Part two, key takeaways.',
      ...highlights.map((h) => `- ${h}`),
      '',
      '（语速加快）Part three, do this next.',
      '1. Pull three quote-level insights from your latest source.',
      '2. Write an 8-12 minute spoken script instead of a full dump.',
      '3. Use a fixed open/close for show identity.',
      '',
      '（轻笑）That’s it for today. If this helped, share it with someone also repurposing content. See you next time.',
    ].join('\n');
    const showNotes = [
      `# ${title}`,
      '',
      `> ${summary}`,
      '',
      '## Outline',
      '',
      ...outline.map((s) => `- **${s.title}**: ${s.summary}`),
      '',
      '## Key points',
      '',
      ...highlights.map((h) => `- ${h}`),
      '',
    ].join('\n');
    return {
      title,
      summary,
      tags,
      hostIntro: buildDemoHostIntro(scriptPrompt, locale),
      outline,
      script,
      showNotes,
      estimatedMinutes: 10,
      coverGradient: pickGradient(title),
    };
  }

  const title = `【播客】${base}：从视频到可收听的内容`;
  const summary =
    '本期把原视频内容重构成一档约 10 分钟的精华播客，提炼核心观点并给出行动建议，适合通勤收听。';
  const tags = ['视频转播客', '内容复用', '口播脚本', '个人品牌'];
  const outline = [
    { title: '开场钩子', summary: '点明为什么要把视频做成播客。' },
    { title: '核心观点', summary: '三到五个可记忆的重点。' },
    { title: '实践建议', summary: '给听友可执行的下一步。' },
    { title: '收尾彩蛋', summary: '总结与下期预告。' },
  ];
  const highlights = transcript
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  const script = [
    '(磁性 沉稳)大家好，欢迎收听本期播客。',
    `今天我们围绕「${base}」展开，把原本的视频内容压缩成一集更容易听完的精华版。`,
    '',
    '（深呼吸）先说结论：好的播客不是把视频原样读一遍，而是重新组织节奏——开场抓住注意力，中间只保留高价值观点，结尾留下行动感。',
    '',
    '第一部分，内容定位。',
    '视频擅长画面与演示，播客擅长陪伴与深度。把视频转成播客，能覆盖开车、散步、做家务这些场景。',
    '',
    '第二部分，今天的关键信息。',
    ...highlights.map((h) => `- ${h}`),
    '',
    '（语速加快）第三部分，你可以立刻做的事。',
    '1. 从最近一条视频里抽出三个“金句级”观点。',
    '2. 写成 8 到 12 分钟口播稿，而不是完整搬运。',
    '3. 用固定开场和收尾建立节目辨识度。',
    '',
    '（轻笑）好，今天的内容就到这里。如果你觉得有帮助，欢迎分享给同样在做内容复用的朋友。我们下期见。',
  ].join('\n');
  const showNotes = [
    `# ${title}`,
    '',
    `> ${summary}`,
    '',
    '## 本期大纲',
    '',
    ...outline.map((s) => `- **${s.title}**：${s.summary}`),
    '',
    '## 关键要点',
    '',
    ...highlights.map((h) => `- ${h}`),
    '',
  ].join('\n');
  return {
    title,
    summary,
    tags,
    hostIntro: buildDemoHostIntro(scriptPrompt, locale),
    outline,
    script,
    showNotes,
    estimatedMinutes: 10,
    coverGradient: pickGradient(title),
  };
}

async function llmPodcast(
  transcript: string,
  sourceTitle: string,
  scriptPrompt?: ScriptPromptOptions,
  locale: Locale = 'zh-CN',
): Promise<PodcastContent> {
  const loc = resolveContentLocale(locale);
  const maxChars = resolveScriptMaxChars(scriptPrompt);
  const targetMin = Math.max(300, Math.round(maxChars * 0.75));
  const system = buildPodcastSystemPrompt({
    locale: loc,
    targetMin,
    maxChars,
    personaSection: buildScriptPromptSection(scriptPrompt, loc),
  });
  const user = buildPodcastUserPrompt(loc, sourceTitle, transcript);

  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getChatModel(),
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`播客脚本生成失败 (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('播客脚本结果为空');

  // 兼容模型偶发输出代码围栏
  content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let parsed: Partial<PodcastContent>;
  try {
    parsed = JSON.parse(content) as Partial<PodcastContent>;
  } catch {
    throw new Error('播客脚本 JSON 解析失败');
  }

  const fallback = podcastFallbackCopy(loc, sourceTitle);
  const title = String(parsed.title || fallback.title).trim();
  const outline = Array.isArray(parsed.outline)
    ? parsed.outline
        .map((s) => ({
          title: String((s as PodcastContent['outline'][number])?.title || '').trim(),
          summary: String((s as PodcastContent['outline'][number])?.summary || '').trim(),
        }))
        .filter((s) => s.title)
    : [];

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
    : [];

  let script = String(parsed.script || '').trim();
  if (!script) throw new Error('播客脚本 script 为空');

  // 超字数时重写一次（仍超则保留，但会按实测字数修正时长估算）
  let spokenCount = countSpokenChars(script);
  if (spokenCount > maxChars) {
    const rewritten = await rewriteScriptToLimit({
      script,
      maxChars,
      sourceTitle,
      title,
      locale: loc,
    });
    if (rewritten) {
      script = rewritten;
      spokenCount = countSpokenChars(script);
    }
  }

  const estimatedFromChars = Math.max(
    1,
    Math.round(spokenCount / spokenCharsPerMinute(loc)),
  );
  const estimatedMinutes =
    Number(parsed.estimatedMinutes) > 0
      ? Math.min(Number(parsed.estimatedMinutes), Math.max(estimatedFromChars, 1))
      : estimatedFromChars;

  return {
    title,
    summary: String(parsed.summary || '').trim() || fallback.summary,
    tags: tags.length ? tags : fallback.tags,
    hostIntro: String(parsed.hostIntro || '').trim() || fallback.hostIntro,
    outline: outline.length
      ? outline
      : [{ title: fallback.outlineTitle, summary: fallback.outlineSummary }],
    script,
    showNotes:
      String(parsed.showNotes || '').trim() ||
      `# ${title}\n\n${parsed.summary || ''}`,
    estimatedMinutes,
    coverGradient: pickGradient(title),
  };
}

/** 超字数时请求压缩改写，失败则返回 null */
async function rewriteScriptToLimit(input: {
  script: string;
  maxChars: number;
  sourceTitle: string;
  title: string;
  locale?: Locale | string | null;
}): Promise<string | null> {
  const loc = resolveContentLocale(input.locale);
  const current = countSpokenChars(input.script);
  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getChatModel(),
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildRewriteSystemPrompt(loc, input.maxChars, current),
        },
        {
          role: 'user',
          content: buildRewriteUserPrompt(loc, input),
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(content) as { script?: string };
    const next = String(parsed.script || '').trim();
    if (!next) return null;
    // 只有确实变短才采用
    if (countSpokenChars(next) >= current) return null;
    return next;
  } catch {
    return null;
  }
}

export async function generatePodcast(
  transcript: string,
  sourceTitle: string,
  jobId: string,
  scriptPrompt?: ScriptPromptOptions,
  locale?: Locale | string | null,
): Promise<{ podcast: PodcastContent; demo: boolean }> {
  const paths = jobPaths(jobId);
  const loc = resolveContentLocale(locale);
  const demo = !hasApiKey();
  const podcast = demo
    ? demoPodcast(transcript, sourceTitle, scriptPrompt, loc)
    : await llmPodcast(transcript, sourceTitle, scriptPrompt, loc);

  await writeText(paths.script, podcast.script);
  await writeText(paths.showNotes, podcast.showNotes);
  return { podcast, demo };
}
