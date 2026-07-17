import { writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import type { Flashcard, PodcastContent } from '../types/job.js';
import { aiFetch, getChatModel, hasApiKey } from '../utils/aiConfig.js';
import type { Locale } from '../i18n/types.js';
import {
  buildFlashcardUserContext,
  resolveContentLocale,
} from '../i18n/contentLocale.js';
import { resolveFlashcardSystemPrompt } from './aiPromptTemplates.js';

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
  /** 内容输出语言（默认中文） */
  locale?: Locale | string | null;
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
  locale: Locale = 'zh-CN',
): Flashcard[] {
  const loc = resolveContentLocale(locale);
  const base =
    (podcast?.title || sourceTitle).replace(/\.[^.]+$/, '') ||
    (loc === 'en-US' ? 'This episode' : '本期内容');
  const lines = transcript
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8)
    .slice(0, 6);

  const outline = podcast?.outline || [];
  const cards: Flashcard[] = [];

  if (loc === 'en-US') {
    cards.push(
      {
        id: stableId(base, 0, 'what'),
        front: `What core problem does "${base}" try to solve?`,
        back:
          podcast?.summary?.trim() ||
          'Rewrite the source into reviewable flashcards with concepts, conclusions, and actions.',
        tags: ['overview'],
      },
      {
        id: stableId(base, 1, 'takeaway'),
        front: 'If you keep only one takeaway, what is it?',
        back:
          lines[0] ||
          'Great content is rebuilt, not copied: focus, retell, and act.',
        tags: ['conclusion'],
      },
    );
    outline.slice(0, 4).forEach((seg, i) => {
      cards.push({
        id: stableId(base, i + 2, seg.title),
        front: `What is "${seg.title}" about?`,
        back: seg.summary || '(outline summary missing)',
        tags: ['outline'],
      });
    });
    lines.slice(0, 4).forEach((line, i) => {
      cards.push({
        id: stableId(base, i + 10, line.slice(0, 24)),
        front: `Key line ${i + 1}: what does this emphasize?`,
        back: line,
        tags: ['point'],
      });
    });
    if (cards.length < 6) {
      cards.push({
        id: stableId(base, 20, 'action'),
        front: 'What should you do immediately after listening?',
        back: 'Retell three points in your own words and write one next action.',
        tags: ['action'],
      });
    }
    return cards.slice(0, 12);
  }

  cards.push(
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
  );

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
  locale: Locale = 'zh-CN',
): Promise<Flashcard[]> {
  const loc = resolveContentLocale(locale);
  const system = resolveFlashcardSystemPrompt(loc);
  const outlineText = podcast?.outline?.length
    ? podcast.outline
        .map((s, i) => `${i + 1}. ${s.title} — ${s.summary}`)
        .join('\n')
    : undefined;
  const context = buildFlashcardUserContext(loc, {
    sourceTitle,
    title: podcast?.title,
    summary: podcast?.summary,
    tags: podcast?.tags,
    outlineText,
    showNotes: podcast?.showNotes,
    transcript,
  });

  const res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getChatModel(),
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
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

  const loc = resolveContentLocale(input.locale);
  const demo = !hasApiKey('llm');
  const flashcards = demo
    ? demoFlashcards(transcript, sourceTitle, podcast, loc)
    : await llmFlashcards(transcript, sourceTitle, podcast, loc);

  const paths = jobPaths(jobId);
  await writeText(paths.flashcards, JSON.stringify({ cards: flashcards }, null, 2));
  return { flashcards, demo };
}
