/** 将口播脚本切成适合跟读的句子段落 */
export function splitScriptLines(script: string): string[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const lines: string[] = [];
  for (const block of blocks) {
    // 按中文/英文句读切分，保留分隔符
    const parts = block.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) {
      // 长句按逗号再拆（过长时）
      if (block.length > 60) {
        const soft = block.split(/(?<=[，,、])/).map((s) => s.trim()).filter(Boolean);
        if (soft.length > 1) {
          let buf = '';
          for (const s of soft) {
            if ((buf + s).length > 48 && buf) {
              lines.push(buf);
              buf = s;
            } else {
              buf += s;
            }
          }
          if (buf) lines.push(buf);
          continue;
        }
      }
      lines.push(block);
    } else {
      lines.push(...parts);
    }
  }
  return lines.length ? lines : [normalized];
}

/** 按字符权重估算每句时长占比，映射当前播放进度到句子索引 */
export function activeLineIndex(
  lines: string[],
  currentSec: number,
  durationSec: number,
): number {
  if (!lines.length) return 0;
  if (!durationSec || durationSec <= 0) return 0;
  const weights = lines.map((l) => Math.max(4, l.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const ratio = Math.min(1, Math.max(0, currentSec / durationSec));
  let acc = 0;
  const target = ratio * total;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  return lines.length - 1;
}

/** 点击某句时，估算应跳转的秒数（句首） */
export function seekSecForLine(
  lines: string[],
  index: number,
  durationSec: number,
): number {
  if (!lines.length || !durationSec || durationSec <= 0) return 0;
  const weights = lines.map((l) => Math.max(4, l.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  for (let i = 0; i < index; i += 1) acc += weights[i];
  return (acc / total) * durationSec;
}
