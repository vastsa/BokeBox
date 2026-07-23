/**
 * 轻量 cron 解析与下次触发计算(5 fields: min hour dom mon dow)
 * supports number, star, lists, step n, ranges a-b
 * timezone: IANA name, default Asia/Shanghai
 */

export type CronFields = {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
};

const PRESET_CRON: Record<string, string> = {
  hourly: '0 * * * *',
  every_6h: '0 */6 * * *',
  daily: '0 8 * * *',
  weekly: '0 8 * * 1',
};

export function cronFromPreset(preset: string, cron?: string): string {
  if (preset === 'cron') {
    return String(cron || '').trim() || '0 8 * * *';
  }
  return PRESET_CRON[preset] || PRESET_CRON.daily;
}

function expandField(
  field: string,
  min: number,
  max: number,
): number[] | null {
  const raw = field.trim();
  if (!raw) return null;
  const out = new Set<number>();

  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;

    // */n 或 a-b/n 或 *
    const stepMatch = token.match(/^(.+)\/(\d+)$/);
    let base = token;
    let step = 1;
    if (stepMatch) {
      base = stepMatch[1]!;
      step = Number(stepMatch[2]);
      if (!Number.isInteger(step) || step < 1) return null;
    }

    if (base === '*') {
      for (let i = min; i <= max; i += step) out.add(i);
      continue;
    }

    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      let a = Number(rangeMatch[1]);
      let b = Number(rangeMatch[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      if (a > b) [a, b] = [b, a];
      if (a < min || b > max) return null;
      for (let i = a; i <= b; i += step) out.add(i);
      continue;
    }

    const n = Number(base);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    // 单值 + 步长时按从该值起步长
    if (step > 1) {
      for (let i = n; i <= max; i += step) out.add(i);
    } else {
      out.add(n);
    }
  }

  if (!out.size) return null;
  return [...out].sort((a, b) => a - b);
}

/** 解析 5 段 cron；非法返回 null */
export function parseCron(expr: string): CronFields | null {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = expandField(parts[0]!, 0, 59);
  const hour = expandField(parts[1]!, 0, 23);
  const dayOfMonth = expandField(parts[2]!, 1, 31);
  const month = expandField(parts[3]!, 1, 12);
  // 0 与 7 都表示周日
  const dowRaw = expandField(parts[4]!, 0, 7);
  if (!minute || !hour || !dayOfMonth || !month || !dowRaw) return null;
  const dayOfWeek = [
    ...new Set(dowRaw.map((d) => (d === 7 ? 0 : d))),
  ].sort((a, b) => a - b);
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) != null;
}

function zonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dayOfWeek: weekdayMap[map.weekday || ''] ?? date.getUTCDay(),
  };
}

/** 将某时区墙钟时间转换为 UTC Date（二分搜索） */
function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // 粗略起点：当作 UTC
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = target - asUtc;
    if (Math.abs(delta) < 1000) break;
    guess += delta;
  }
  return new Date(guess);
}

function matches(parts: ReturnType<typeof zonedParts>, fields: CronFields): boolean {
  if (!fields.minute.includes(parts.minute)) return false;
  if (!fields.hour.includes(parts.hour)) return false;
  if (!fields.month.includes(parts.month)) return false;
  const domOk = fields.dayOfMonth.includes(parts.day);
  const dowOk = fields.dayOfWeek.includes(parts.dayOfWeek);
  // 标准 cron：日与周同时非 * 时 OR；我们展开后都是具体集合，采用 OR 当两者都不是全集时
  const domAll = fields.dayOfMonth.length === 31;
  const dowAll = fields.dayOfWeek.length === 7;
  if (!domAll && !dowAll) return domOk || dowOk;
  if (!domAll) return domOk;
  if (!dowAll) return dowOk;
  return true;
}

/**
 * 计算 from 之后（不含 from 整分若刚好命中则取下一分钟起）的下次触发 UTC ISO
 */
export function getNextRunAt(
  cronExpr: string,
  timeZone: string,
  from: Date = new Date(),
): string | null {
  const fields = parseCron(cronExpr);
  if (!fields) return null;
  const tz = timeZone || 'Asia/Shanghai';

  // 从下一分钟开始扫，最多扫 366 天 * 24 * 60
  const start = new Date(from.getTime());
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  const maxSteps = 366 * 24 * 60;
  let cursor = start.getTime();
  for (let i = 0; i < maxSteps; i++) {
    const d = new Date(cursor);
    const parts = zonedParts(d, tz);
    if (matches(parts, fields)) {
      // 对齐到该时区墙钟的整分
      const hit = zonedWallToUtc(
        parts.year,
        parts.month,
        parts.day,
        parts.hour,
        parts.minute,
        tz,
      );
      return hit.toISOString();
    }
    cursor += 60_000;
  }
  return null;
}

export function listPresetOptions(): Array<{
  id: string;
  cron: string;
  labelZh: string;
  labelEn: string;
}> {
  return [
    {
      id: 'hourly',
      cron: PRESET_CRON.hourly,
      labelZh: '每小时',
      labelEn: 'Hourly',
    },
    {
      id: 'every_6h',
      cron: PRESET_CRON.every_6h,
      labelZh: '每 6 小时',
      labelEn: 'Every 6 hours',
    },
    {
      id: 'daily',
      cron: PRESET_CRON.daily,
      labelZh: '每天 08:00',
      labelEn: 'Daily 08:00',
    },
    {
      id: 'weekly',
      cron: PRESET_CRON.weekly,
      labelZh: '每周一 08:00',
      labelEn: 'Weekly Mon 08:00',
    },
    {
      id: 'cron',
      cron: '',
      labelZh: '自定义 Cron',
      labelEn: 'Custom cron',
    },
  ];
}
