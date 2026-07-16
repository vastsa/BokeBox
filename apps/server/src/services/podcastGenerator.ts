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
function buildDemoHostIntro(scriptPrompt?: ScriptPromptOptions): string {
  if (!hasScriptPrompt(scriptPrompt)) {
    return '主持人将原视频内容重构成一档通勤向精华播客。';
  }
  const name = scriptPrompt?.hostName || '主持人';
  const identity = scriptPrompt?.hostIdentity
    ? `（${scriptPrompt.hostIdentity}）`
    : '';
  const show = scriptPrompt?.showName ? `《${scriptPrompt.showName}》` : '本期节目';
  return `${name}${identity} 以${show}视角，将原视频内容重构成一档通勤向精华播客。`;
}

function demoPodcast(
  transcript: string,
  sourceTitle: string,
  scriptPrompt?: ScriptPromptOptions,
): PodcastContent {
  const base = sourceTitle.replace(/\.[^.]+$/, '') || '视频精华';
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

  // 演示稿：开头风格标签 + 正文细粒度标签
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
    hostIntro: buildDemoHostIntro(scriptPrompt),
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
): Promise<PodcastContent> {
  const maxChars = resolveScriptMaxChars(scriptPrompt);
  const targetMin = Math.max(300, Math.round(maxChars * 0.75));
  const system = [
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
    buildScriptPromptSection(scriptPrompt),
  ]
    .filter(Boolean)
    .join('\n');

  const user = [`视频文件名：${sourceTitle}`, '', '转写稿：', transcript].join('\n');

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

  const title = String(parsed.title || `【播客】${sourceTitle}`).trim();
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
    });
    if (rewritten) {
      script = rewritten;
      spokenCount = countSpokenChars(script);
    }
  }

  const estimatedFromChars = Math.max(1, Math.round(spokenCount / 220));
  const estimatedMinutes =
    Number(parsed.estimatedMinutes) > 0
      ? Math.min(Number(parsed.estimatedMinutes), Math.max(estimatedFromChars, 1))
      : estimatedFromChars;

  return {
    title,
    summary: String(parsed.summary || '').trim() || '本期精华播客。',
    tags: tags.length ? tags : ['视频转播客'],
    hostIntro: String(parsed.hostIntro || '').trim() || '主持人重构视频精华。',
    outline: outline.length
      ? outline
      : [{ title: '本期内容', summary: '核心观点与建议' }],
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
}): Promise<string | null> {
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
          content: [
            '你是播客口播编辑。任务：把给定 script 压缩到字数上限内。',
            '硬性要求：',
            `1. 去除音频标签后的正文字数必须 ≤ ${input.maxChars} 字（当前约 ${current} 字）。`,
            '2. 保留开场、核心观点、收尾；删除重复与次要展开。',
            '3. 保留并合理精简 MiMo TTS 音频标签（开头风格标签 + 若干细粒度标签）。',
            '4. 不要编造新事实。',
            '5. 输出严格 JSON：{"script":"..."}，不要 markdown。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `节目标题：${input.title}`,
            `来源：${input.sourceTitle}`,
            `字数上限：${input.maxChars}`,
            '',
            '原 script：',
            input.script,
          ].join('\n'),
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
): Promise<{ podcast: PodcastContent; demo: boolean }> {
  const paths = jobPaths(jobId);
  const demo = !hasApiKey();
  const podcast = demo
    ? demoPodcast(transcript, sourceTitle, scriptPrompt)
    : await llmPodcast(transcript, sourceTitle, scriptPrompt);

  await writeText(paths.script, podcast.script);
  await writeText(paths.showNotes, podcast.showNotes);
  return { podcast, demo };
}
