/** 按句挑选语气/控制标签（与具体 TTS 协议无关） */

import { isAudioControlTag } from '@bokebox/shared';

export type SentenceStylePlan = {
  /** 句首风格标签，如 沉稳 / 欢快 */
  styleTags: string[];
  /** 句内细粒度控制，如 轻笑 / 深呼吸 */
  controlTags: string[];
};

type Rule = {
  id: string;
  /** 命中任一模式即可 */
  patterns: RegExp[];
  style?: string[];
  control?: string[];
  /** 越大越优先 */
  weight: number;
};

const SCENE_RULES: Rule[] = [
  {
    id: 'laugh',
    patterns: [
      /哈哈|哈哈哈|笑死|搞笑|有意思|有趣|好玩|太逗|笑出|好笑|段子|玩笑|幽默|轻松聊聊/,
      /\blol\b|\blmao\b|haha|funny|hilarious|joke/i,
    ],
    style: ['欢快'],
    control: ['轻笑'],
    weight: 90,
  },
  {
    id: 'excited',
    patterns: [
      /太棒了|精彩|激动|兴奋|震撼|重磅|突破|飙升|爆发|炸裂|强烈推荐|必须看|绝了|燃起来/,
      /amazing|exciting|thrilled|breakthrough|huge|incredible|must[- ]see/i,
    ],
    style: ['激昂'],
    control: ['激动', '提高音量'],
    weight: 85,
  },
  {
    id: 'shock',
    patterns: [
      /没想到|竟然|居然|震惊|离谱|不可思议|反转|突然|惊人|吓人|爆炸性/,
      /unexpected|shocking|unbelievable|suddenly|twist|surprisingly/i,
    ],
    style: ['激昂'],
    control: ['震惊'],
    weight: 82,
  },
  {
    id: 'sad',
    patterns: [
      /遗憾|可惜|难过|心疼|沉重|悲伤|痛心|无奈|惋惜|泪目|心酸|失望/,
      /sad|regret|unfortunately|heartbreaking|sorry to say|pity/i,
    ],
    style: ['怅然'],
    control: ['叹气'],
    weight: 80,
  },
  {
    id: 'tender',
    patterns: [
      /温柔|慢慢来|别着急|放心|陪伴|关心|体贴|暖心|安抚|轻声|呵护/,
      /gently|softly|take your time|don't worry|it's okay|warm/i,
    ],
    style: ['温柔'],
    control: ['小声'],
    weight: 72,
  },
  {
    id: 'serious',
    patterns: [
      /重要|关键|注意|务必|强调|郑重|严肃|警告|风险|后果|原则|底线|切记/,
      /important|critical|note that|be careful|warning|risk|must|seriously/i,
    ],
    style: ['沉稳'],
    control: ['郑重'],
    weight: 78,
  },
  {
    id: 'question',
    patterns: [/[？?]\s*$/, /你觉得|你会|有没有想过|问题是|为什么|怎么理解|怎么看/],
    style: ['清亮'],
    control: ['停顿片刻'],
    weight: 60,
  },
  {
    id: 'list_or_fact',
    patterns: [
      /首先|其次|再次|另外|第一|第二|第三|一方面|另一方面|数据显示|据统计|换句话说|也就是说/,
      /first(ly)?|second(ly)?|third(ly)?|in other words|that is|data shows|according to/i,
    ],
    style: ['沉稳'],
    control: ['语速放慢'],
    weight: 58,
  },
  {
    id: 'closing',
    patterns: [
      /下期见|我们下期|感谢收听|感谢聆听|拜拜|再见|今天就到这里|先聊到这里|下集见|下次见/,
      /see you|thanks for listening|that's all|goodbye|wrap up|next episode/i,
    ],
    style: ['温柔'],
    control: ['轻笑'],
    weight: 70,
  },
  {
    id: 'opening',
    patterns: [
      /^(?:嗯{0,2}|好的{0,1})?(?:大家好|各位听众|听众朋友|欢迎收听|欢迎来到)/,
      /欢迎收听|欢迎来到本期|欢迎回到|各位听众/,
      /^(?:welcome|hello everyone|hi everyone)\b/i,
      /\bin this episode\b|\bthanks for (?:tuning|joining)\b/i,
    ],
    style: ['清亮'],
    control: ['深呼吸'],
    weight: 65,
  },
  {
    id: 'whisper',
    patterns: [/悄悄|私密|秘密|小声说|心里话|坦白讲|说真的|实话说/, /secretly|between us|honestly|to be honest/i],
    style: ['慵懒'],
    control: ['小声', '气声'],
    weight: 68,
  },
  {
    id: 'tired',
    patterns: [/太累|疲惫|辛苦|不容易|压力大|熬夜|崩溃边缘/, /tired|exhausted|burn(?:ed)? out|overwhelmed/i],
    style: ['慵懒'],
    control: ['疲惫'],
    weight: 66,
  },
  {
    id: 'affection',
    patterns: [/喜欢|热爱|心动|感动|温暖|真挚|珍惜|拥抱/, /love|adore|touching|grateful|cherish/i],
    style: ['深情'],
    control: [],
    weight: 55,
  },
  {
    id: 'fast_pace',
    patterns: [/一句话总结|快速过|长话短说|简单说|速览|划重点|结论是/, /in short|tl;dr|quick recap|bottom line|to sum up/i],
    style: ['清亮'],
    control: ['语速加快'],
    weight: 62,
  },
];

function uniqueTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

function stripLeadingControlOnly(text: string): string {
  return String(text || '')
    .replace(/^[\s\[\(（]+([^\]\)）]{1,32})[\]\)）]\s*/u, (full, label: string) =>
      isAudioControlTag(label) ? '' : full,
    )
    .trim();
}

/**
 * 根据句子内容挑选「合适场景」的语气标签。
 * - preferredStyle：用户全局风格，作底色（每句最多带 1 个）
 * - 场景规则可叠加 0-1 个风格 + 0-2 个细粒度控制
 * - 句内已有控制标签时不再重复塞同类
 */
export function planSentenceStyleTags(
  text: string,
  options?: {
    preferredStyle?: string[] | string | null;
    index?: number;
    total?: number;
  },
): SentenceStylePlan {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { styleTags: [], controlTags: [] };

  const preferredSeed = uniqueTags(
    Array.isArray(options?.preferredStyle)
      ? options!.preferredStyle!
      : String(options?.preferredStyle || '')
          .split(/[\s,，、|]+/)
          .filter(Boolean),
  );

  // 文稿句首若已有风格标签，并入底色（脚本生成阶段可能已写）
  const fromLeading: string[] = [];
  const leading = raw.match(/^[\[\(（]\s*([^\]\)）]+?)\s*[\]\)）]\s*/u);
  if (leading && isAudioControlTag(leading[1])) {
    for (const part of leading[1].split(/[\s,，、/|]+/)) {
      const t = part.trim();
      if (t) fromLeading.push(t);
    }
  }
  const preferredUnique = uniqueTags([...fromLeading, ...preferredSeed]);

  const body = stripLeadingControlOnly(raw);
  const index = options?.index ?? 0;
  const total = options?.total ?? 0;

  const hits: Rule[] = [];
  for (const rule of SCENE_RULES) {
    if (rule.patterns.some((re) => re.test(body))) hits.push(rule);
  }

  // 首尾句弱兜底：没有场景命中时给开场/收尾一点呼吸感
  if (!hits.length && total > 0) {
    if (index === 0) {
      hits.push({
        id: 'fallback-open',
        patterns: [],
        style: preferredUnique.slice(0, 1),
        control: ['深呼吸'],
        weight: 10,
      });
    } else if (index === total - 1) {
      hits.push({
        id: 'fallback-close',
        patterns: [],
        style: preferredUnique.slice(0, 1),
        control: ['轻笑'],
        weight: 10,
      });
    }
  }

  hits.sort((a, b) => b.weight - a.weight);
  const top = hits.slice(0, 2);

  const styleTags = uniqueTags([
    ...preferredUnique.slice(0, 1),
    ...top.flatMap((r) => r.style || []),
  ]).slice(0, 2);

  // 已有细粒度标签则尽量少重复
  const existingControl = new Set<string>();
  const re = /[\[\(（]\s*([^\]\)）]{1,32}?)\s*[\]\)）]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (isAudioControlTag(m[1])) {
      for (const part of m[1].split(/[\s,，、/|]+/)) {
        const t = part.trim();
        if (t) existingControl.add(t);
      }
    }
  }

  const controlTags = uniqueTags(top.flatMap((r) => r.control || []))
    .filter((t) => !existingControl.has(t))
    .slice(0, 2);

  // 无场景命中时：仅保留用户全局风格，不强行塞控制标签
  if (!hits.length) {
    return { styleTags: preferredUnique.slice(0, 1), controlTags: [] };
  }

  return { styleTags, controlTags };
}

/**
 * 把规划结果写回句子：句首风格 + 可选句首控制标签。
 * 保留句中已有标签。
 */
export function applyPlannedStyleToSentence(
  text: string,
  plan: SentenceStylePlan,
): string {
  let body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) return body;

  // 剥掉句首已有「纯风格/控制」标签，避免重复堆叠
  while (true) {
    const m = body.match(/^[\[\(（]\s*([^\]\)）]+?)\s*[\]\)）]\s*([\s\S]*)$/u);
    if (!m || !isAudioControlTag(m[1])) break;
    body = m[2].trim();
  }

  const style = uniqueTags(plan.styleTags).slice(0, 2);
  const control = uniqueTags(plan.controlTags).slice(0, 2);
  const parts: string[] = [];
  if (style.length) parts.push(`(${style.join(' ')})`);
  for (const c of control) parts.push(`（${c}）`);
  if (!parts.length) return body;
  return `${parts.join('')}${body}`;
}
