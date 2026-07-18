/**
 * 启动控制台开源信息横幅（纯 ASCII，兼容各类终端）
 * 保留 LGPL-3.0 协议与仓库归属信息
 */

export const PROJECT_NAME = 'BokeBox';
export const PROJECT_TAGLINE = 'Private AI Podcast Studio';
export const PROJECT_LICENSE = 'LGPL-3.0';
export const PROJECT_REPO = 'https://github.com/vastsa/BokeBox/';
export const PROJECT_HOMEPAGE = 'https://github.com/vastsa/BokeBox/';

/** 纯 ASCII 品牌字标 */
const LOGO_ASCII = [
  '  ____        _        ____            ',
  ' |  _ \\      | |      |  _ \\           ',
  ' | |_) | ___ | | _____| |_) | _____  __',
  ' |  _ < / _ \\| |/ / _ \\  _ < / _ \\ \\/ /',
  ' | |_) | (_) |   <  __/ |_) | (_) >  < ',
  ' |____/ \\___/|_|\\_\\___|____/ \\___/_/\\_\\',
].join('\n');

function padLine(text: string, width: number): string {
  const visible = text.length;
  if (visible >= width) return text.slice(0, width);
  return text + ' '.repeat(width - visible);
}

/**
 * 构建启动时打印的开源信息横幅
 */
export function buildOpenSourceBanner(options?: {
  version?: string;
}): string {
  const version = options?.version ?? '1.0.0';
  const innerWidth = 60;

  const lines: string[] = [];
  const top = `+${'-'.repeat(innerWidth + 2)}+`;
  const empty = `| ${' '.repeat(innerWidth)} |`;

  const row = (content: string) => `| ${padLine(content, innerWidth)} |`;

  lines.push(top);
  lines.push(empty);
  for (const logoLine of LOGO_ASCII.split('\n')) {
    lines.push(row(logoLine));
  }
  lines.push(empty);
  lines.push(row(`  ${PROJECT_NAME}  |  ${PROJECT_TAGLINE}`));
  lines.push(row(`  Version  : ${version}`));
  lines.push(row(`  License  : ${PROJECT_LICENSE}`));
  lines.push(row(`  Open Src : ${PROJECT_REPO}`));
  lines.push(empty);
  lines.push(
    row('  Free software | LGPL-3.0 | keep license & attribution'),
  );
  lines.push(empty);
  lines.push(`+${'-'.repeat(innerWidth + 2)}+`);

  return lines.join('\n');
}

/** 向 stdout 打印开源信息横幅 */
export function printOpenSourceBanner(options?: {
  version?: string;
}): void {
  const banner = buildOpenSourceBanner(options);
  // 直接写 stdout，避免被 pino 日志格式包裹
  console.log(`\n${banner}\n`);
}
