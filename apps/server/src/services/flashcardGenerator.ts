import { writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import type { Flashcard, PodcastContent } from '../types/job.js';
import { aiFetch, getChatModel, hasApiKey } from '../utils/aiConfig.js';

export interface FlashcardGenerateInput {
  jobId: string;
  /** 原始转写 / 文本素材 */
  transcript: string;
  sourceTitle: string;
  /** 已生成的播客元信息，可选增强上下文 */
  podcast?: Pick<
    PodcastContent,
    'title' | 'summary' | 'tags' | 'outline' | 'showNotes' | 'script'
  >;
}

function stableId(prefix: string, index: number, seed: string): string {
  let h = 0;
  const s = `${prefix}:${index}:${seed}`;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return `fc_${h.toString(36)}_${index + 1}`;
}

function normalizeCards(raw: unknown, seed: string): Flashcard[] {
  if (!Array.isArray(raw)) return [];
  const out: Flashcard[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const front = String(row.front ?? row.question ?? row.q ?? '').trim();
    const back = String(row.back ?? row.answer ?? row.a ?? '').trim();
    if (!front || !back) return;
    const hint = String(row.hint ?? '').trim();
    const tags = Array.isArray(row.tags)
      ? row.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
      : [];
    const idRaw = String(row.id ?? '').trim();
    out.push({
      id: idRaw || stableId(seed, index, front),
      front,
      back,
      ...(hint ? { hint } : {}),
      ...(tags.length ? { tags } : {}),
    });
  });
  return out.slice(0, 16);
}

function demoFlashcards(
  transcript: string,
  sourceTitle: string,
  podcast?: FlashcardGenerateInput['podcast'],
): Flashcard[] {
  const base = (podcast?.title || sourceTitle).replace(/\.[^.]+$/, '') || '本期内容';
  const lines = transcript
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8)
    .slice(0, 6);

  const outline = podcast?.outline || [];
  const cards: Flashcard[] = [
    {
      id: stableId(base, 0, 'what'),
      front: `本期「${base}」核心要解决什么问题？`,
      back:
        podcast?.summary?.trim() ||
        '把原始素材重构成可复习的知识卡片，提炼概念、结论与行动建议。',
      tags: ['总览'],
    },
    {
      id: stableId(base, 1, 'takeaway'),
      front: '如果只记一个结论，应该是什么？',
      back:
        lines[0] ||
        '好内容不是原样搬运，而是重新组织：抓重点、可复述、可行动。',
      tags: ['结论'],
    },
  ];

  outline.slice(0, 4).forEach((seg, i) => {
    cards.push({
      id: stableId(base, i + 2, seg.title),
      front: `「${seg.title}」在讲什么？`,
      back: seg.summary || '（大纲摘要暂缺）',
      tags: ['大纲'],
    });
  });

  lines.slice(0, 4).forEach((line, i) => {
    cards.push({
      id: stableId(base, i + 10, line.slice(0, 24)),
      front: `关键信息 ${i + 1}：这句话想强调什么？`,
      back: line,
      tags: ['要点'],
    });
  });

  if (cards.length < 6) {
    cards.push({
      id: stableId(base, 20, 'action'),
      front: '听完后最该立刻做的一步是什么？',
      back: '用自己的话复述 3 个要点，并写出一条可执行的下一步。',
      tags: ['行动'],
    });
  }

  return cards.slice(0, 12);
}

async function llmFlashcards(
  transcript: string,
  sourceTitle: string,
  podcast?: FlashcardGenerateInput['podcast'],
): Promise<Flashcard[]> {
  const system = [
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
  ].join('\n');

  const contextParts = [
    `素材标题：${sourceTitle}`,
    podcast?.title ? `节目名：${podcast.title}` : '',
    podcast?.summary ? `摘要：${podcast.summary}` : '',
    podcast?.tags?.length ? `标签：${podcast.tags.join('、')}` : '',
    podcast?.outline?.length
      ? `大纲：\n${podcast.outline
          .map((s, i) => `${i + 1}. ${s.title} — ${s.summary}`)
          .join('\n')}`
      : '',
    podcast?.showNotes
      ? `节目笔记（参考，勿照抄）：\n${podcast.showNotes.slice(0, 2500)}`
      : '',
    '',
    '转写/原文（主依据）：',
    transcript.slice(0, 12000),
  ].filter(Boolean);

  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getChatModel(),
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: contextParts.join('\n') },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`知识闪卡生成失败 (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('知识闪卡结果为空');

  content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let parsed: { cards?: unknown; flashcards?: unknown } & Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new Error('知识闪卡 JSON 解析失败');
  }

  const seed = podcast?.title || sourceTitle || 'flashcards';
  const cards = normalizeCards(parsed.cards ?? parsed.flashcards ?? parsed, seed);
  if (!cards.length) throw new Error('知识闪卡为空');
  return cards;
}

/** 独立 AI 生成知识闪卡，并落盘 flashcards.json */
export async function generateFlashcards(
  input: FlashcardGenerateInput,
): Promise<{ flashcards: Flashcard[]; demo: boolean }> {
  const { jobId, transcript, sourceTitle, podcast } = input;
  if (!transcript.trim()) {
    throw new Error('转写/文本为空，无法生成知识闪卡');
  }

  const demo = !hasApiKey();
  const flashcards = demo
    ? demoFlashcards(transcript, sourceTitle, podcast)
    : await llmFlashcards(transcript, sourceTitle, podcast);

  const paths = jobPaths(jobId);
  await writeText(paths.flashcards, JSON.stringify({ cards: flashcards }, null, 2));
  return { flashcards, demo };
}
