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

/** 去掉 markdown 代码围栏与 BOM */
function stripCodeFence(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function pickText(
  row: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function normalizeCards(raw: unknown, seed: string): Flashcard[] {
  if (!Array.isArray(raw)) return [];
  const out: Flashcard[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    // 兼容 front/question/q/prompt/问题/正面 等常见字段
    const front = pickText(row, [
      'front',
      'question',
      'q',
      'prompt',
      'term',
      'title',
      '问题',
      '正面',
      '问',
    ]);
    const back = pickText(row, [
      'back',
      'answer',
      'a',
      'response',
      'definition',
      'content',
      'explanation',
      '答案',
      '背面',
      '答',
      '解释',
    ]);
    if (!front || !back) return;
    const hint = pickText(row, ['hint', 'tips', 'tip', '提示', '线索']);
    const tagsRaw = row.tags ?? row.tag ?? row.labels ?? row.categories;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
      : typeof tagsRaw === 'string' && tagsRaw.trim()
        ? tagsRaw
            .split(/[,，、|/]/)
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 4)
        : [];
    const idRaw = String(row.id ?? row.cardId ?? row.key ?? '').trim();
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

/**
 * 从模型输出中尽量提取闪卡列表。
 * 兼容：
 * - {"cards":[...]} / {"flashcards":[...]}
 * - 直接数组 [...]
 * - NDJSON：每行一个对象
 * - 对象字典 {"1":{...},"2":{...}}
 * - 截断后的部分 JSON（尽量抢救）
 */
function extractCardArray(content: string): unknown[] {
  const text = stripCodeFence(content);
  if (!text) return [];

  const tryParse = (raw: string): unknown | undefined => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  const asCards = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return null;
    const obj = value as Record<string, unknown>;
    for (const key of [
      'cards',
      'flashcards',
      'items',
      'data',
      'list',
      'result',
      'results',
      '闪卡',
      '知识卡片',
      '卡片',
    ]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // 单卡对象
    if (
      pickText(obj, ['front', 'question', 'q', '问题', '正面']) &&
      pickText(obj, ['back', 'answer', 'a', '答案', '背面'])
    ) {
      return [obj];
    }
    // 数字/字符串键字典
    const values = Object.values(obj);
    if (
      values.length > 0 &&
      values.every((v) => v && typeof v === 'object' && !Array.isArray(v))
    ) {
      return values;
    }
    return null;
  };

  // 1) 完整 JSON
  const direct = tryParse(text);
  if (direct !== undefined) {
    const cards = asCards(direct);
    if (cards?.length) return cards;
  }

  // 2) 抽取最外层对象或数组片段
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  let start = -1;
  let endChar = '';
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) {
    start = firstObj;
    endChar = '}';
  } else if (firstArr >= 0) {
    start = firstArr;
    endChar = ']';
  }
  if (start >= 0) {
    const last = text.lastIndexOf(endChar);
    if (last > start) {
      const sliced = tryParse(text.slice(start, last + 1));
      if (sliced !== undefined) {
        const cards = asCards(sliced);
        if (cards?.length) return cards;
      }
    }
  }

  // 3) NDJSON / 多行对象：模型在 json_object 模式下常见
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const lineTrim = line.trim().replace(/,\s*$/, '');
    if (!lineTrim || (!lineTrim.startsWith('{') && !lineTrim.startsWith('['))) {
      continue;
    }
    const parsed = tryParse(lineTrim);
    if (parsed === undefined) continue;
    if (Array.isArray(parsed)) {
      objects.push(...parsed);
    } else if (parsed && typeof parsed === 'object') {
      const nested = asCards(parsed);
      if (nested?.length && !pickText(parsed as Record<string, unknown>, ['front', 'question', 'q', '问题'])) {
        objects.push(...nested);
      } else {
        objects.push(parsed);
      }
    }
  }
  if (objects.length) return objects;

  // 4) 全局正则捞取疑似卡对象（最后兜底）
  const found: unknown[] = [];
  const objRe = /\{[^{}]*"(?:front|question|q|问题|正面)"[^{}]*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const parsed = tryParse(m[0]);
    if (parsed && typeof parsed === 'object') found.push(parsed);
  }
  return found;
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

/** 优先口播稿（更干净），转写作补充；控制总长度避免挤爆上下文 */
function buildFlashcardSourceText(
  transcript: string,
  podcast?: FlashcardGenerateInput['podcast'],
): string {
  const script = podcast?.script?.trim() || '';
  const tr = transcript.trim();
  if (script && tr) {
    // 口播稿更适合出卡；转写截短作补充事实
    const scriptPart = script.slice(0, 9000);
    const trPart = tr.slice(0, 4000);
    return `【口播稿】\n${scriptPart}\n\n【转写补充】\n${trPart}`;
  }
  if (script) return script.slice(0, 12000);
  return tr.slice(0, 12000);
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
  const sourceText = buildFlashcardSourceText(transcript, podcast);
  const context = buildFlashcardUserContext(loc, {
    sourceTitle,
    title: podcast?.title,
    summary: podcast?.summary,
    tags: podcast?.tags,
    outlineText,
    showNotes: podcast?.showNotes,
    transcript: sourceText,
  });

  const body = {
    model: getChatModel(),
    temperature: 0.35,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
  };

  let res = await aiFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // 少数兼容网关不支持 response_format：去掉后重试一次
  if (!res.ok) {
    const errBody = await res.text();
    const lower = errBody.toLowerCase();
    const formatUnsupported =
      res.status === 400 &&
      (lower.includes('response_format') ||
        lower.includes('json_object') ||
        lower.includes('response format'));
    if (!formatUnsupported) {
      throw new Error(`知识闪卡生成失败 (${res.status}): ${errBody}`);
    }
    const { response_format: _drop, ...fallback } = body;
    res = await aiFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(fallback),
    });
    if (!res.ok) {
      const body2 = await res.text();
      throw new Error(`知识闪卡生成失败 (${res.status}): ${body2}`);
    }
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('知识闪卡结果为空');

  const seed = podcast?.title || sourceTitle || 'flashcards';
  const cards = normalizeCards(extractCardArray(content), seed);
  if (!cards.length) {
    // 保留片段便于排查，但不把整段模型输出塞进错误信息
    const preview = stripCodeFence(content).slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`知识闪卡为空或无法解析（预览: ${preview}…）`);
  }
  return cards;
}

/** 独立 AI 生成知识闪卡，并落盘 flashcards.json */
export async function generateFlashcards(
  input: FlashcardGenerateInput,
): Promise<{ flashcards: Flashcard[]; demo: boolean }> {
  const { jobId, transcript, sourceTitle, podcast } = input;
  // 转写与口播稿任一可用即可（文本任务/重跑场景更稳）
  const hasSource =
    Boolean(transcript?.trim()) || Boolean(podcast?.script?.trim());
  if (!hasSource) {
    throw new Error('转写/文本为空，无法生成知识闪卡');
  }

  const loc = resolveContentLocale(input.locale);
  const demo = !hasApiKey('llm');
  const sourceForDemo = transcript?.trim() || podcast?.script || '';
  const flashcards = demo
    ? demoFlashcards(sourceForDemo, sourceTitle, podcast, loc)
    : await llmFlashcards(
        transcript?.trim() || podcast?.script || '',
        sourceTitle,
        podcast,
        loc,
      );

  const paths = jobPaths(jobId);
  await writeText(paths.flashcards, JSON.stringify({ cards: flashcards }, null, 2));
  return { flashcards, demo };
}

/** 仅供单测 / 调试：解析模型原始输出 */
export function parseFlashcardModelContent(
  content: string,
  seed = 'flashcards',
): Flashcard[] {
  return normalizeCards(extractCardArray(content), seed);
}
