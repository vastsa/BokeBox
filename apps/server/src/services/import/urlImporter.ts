/**
 * URL 内容获取入口（direct-http 插件底层）
 *
 * 注意：pipeline 请优先通过 `sources.importSource` 接入，
 * 不要在新代码中直接依赖本模块的 importUrlContent。
 *
 * 分层：
 * - kinds.ts      素材类型集合与轻量校验
 * - filename.ts   文件名工具
 * - mediaDetect.ts MIME/魔数识别
 * - html.ts       正文抽取
 * - fetchPage.ts  抓取与反爬
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { jobPaths } from '../../utils/paths.js';
import { ensureDir, writeText } from '../../utils/fs.js';
import {
  AUDIO_EXT,
  VIDEO_EXT,
  isValidHttpUrl,
  type ImportResult,
} from './kinds.js';
import {
  extOf,
  filenameFromUrl,
  safeFilenameBase,
} from './filename.js';
import {
  defaultExt,
  kindFromExt,
  kindFromMagic,
  kindFromMime,
  mimeFor,
} from './mediaDetect.js';
import {
  MAX_BYTES,
  fetchWithRetry,
  resolveArticlePage,
  streamBodyToFile,
} from './fetchPage.js';

function looksLikeMediaUrl(url: string): boolean {
  try {
    const ext = extOf(path.basename(new URL(url).pathname));
    return VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext);
  } catch {
    return false;
  }
}

/**
 * 从远程 URL 下载内容，识别 video / audio / text，并落盘到任务目录。
 * 网页启用反爬增强：UA 轮换 / Cookie 预热。
 */
export async function importUrlContent(
  url: string,
  jobId: string,
): Promise<ImportResult> {
  if (!isValidHttpUrl(url)) {
    throw new Error('请输入有效的 http/https 链接');
  }

  const requestUrl = url.trim();
  const paths = jobPaths(jobId);
  await ensureDir(paths.dir);

  // ── 明确媒体直链：增强直连下载 ──
  if (looksLikeMediaUrl(requestUrl)) {
    let res: Response;
    try {
      res = await fetchWithRetry(requestUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg.startsWith('下载') ? msg : `下载失败: ${msg}`);
    }
    if (!res.ok) {
      throw new Error(`下载失败 HTTP ${res.status}`);
    }
    const finalUrl = res.url || requestUrl;
    const headerMime = (res.headers.get('content-type') || '').toLowerCase();
    const filenameGuess = filenameFromUrl(
      finalUrl,
      res.headers.get('content-disposition'),
    );
    const extGuess = extOf(filenameGuess);
    const kind =
      kindFromMime(headerMime) ||
      kindFromExt(extGuess) ||
      'video';
    if (kind === 'text') {
      // 扩展名像媒体但实际是网页，丢弃响应体后走文章通道
      try {
        await res.arrayBuffer();
      } catch {
        // ignore
      }
    } else {
      const ext = extGuess || defaultExt(kind, headerMime);
      const safeBase = safeFilenameBase(
        path.basename(filenameGuess, extOf(filenameGuess)),
      );
      const filename = `${safeBase}${ext}`;
      const sourcePath = paths.source(ext);
      const size = await streamBodyToFile(res, sourcePath, MAX_BYTES);
      if (!size) throw new Error('远程内容为空');
      return {
        kind,
        sourcePath,
        mimeType: mimeFor(kind, ext, headerMime),
        size,
        filename,
        finalUrl,
      };
    }
  }

  // ── 网页 / 未知：直连抓取 ──
  const resolved = await resolveArticlePage(requestUrl);

  if (resolved.kind === 'media-buffer' && resolved.body) {
    const filenameGuess = filenameFromUrl(resolved.finalUrl);
    const extGuess = extOf(filenameGuess);
    const kind =
      kindFromMime(resolved.headerMime) ||
      kindFromExt(extGuess) ||
      kindFromMagic(resolved.body);
    if (!kind || kind === 'text') {
      throw new Error('媒体内容识别失败');
    }
    const ext = extGuess || defaultExt(kind, resolved.headerMime);
    const safeBase = safeFilenameBase(
      path.basename(filenameGuess, extOf(filenameGuess)),
    );
    const filename = `${safeBase}${ext}`;
    const sourcePath = paths.source(ext);
    await fsp.writeFile(sourcePath, resolved.body);
    const stat = await fsp.stat(sourcePath);
    return {
      kind,
      sourcePath,
      mimeType: mimeFor(kind, ext, resolved.headerMime),
      size: stat.size,
      filename,
      finalUrl: resolved.finalUrl,
    };
  }

  const textContent = resolved.textContent || '';
  if (!textContent || textContent.length < 20) {
    throw new Error(
      '未能提取到有效正文，请换一篇可公开阅读的文章链接',
    );
  }

  const pageTitle = resolved.title || null;
  const safeBase = safeFilenameBase(
    pageTitle ||
      path.basename(filenameFromUrl(resolved.finalUrl), extOf(filenameFromUrl(resolved.finalUrl))) ||
      'article',
    'article',
  );
  const filename = `${safeBase}.txt`;
  const sourcePath = paths.source('.txt');
  // 文首标注抓取通道，便于排查（不污染口播时可忽略首行 meta）
  const payload = textContent;
  await writeText(sourcePath, payload);
  await writeText(paths.transcript, payload);
  const stat = await fsp.stat(sourcePath);

  console.info(
    `[urlImporter] ${requestUrl} → strategy=${resolved.strategy} title=${pageTitle || '-'} chars=${payload.length}`,
  );

  return {
    kind: 'text',
    sourcePath,
    mimeType: 'text/plain',
    size: stat.size,
    filename,
    textContent: payload,
    title: pageTitle || undefined,
    finalUrl: resolved.finalUrl,
  };
}
