/**
 * URL / Content-Disposition 文件名与扩展名工具
 */
import path from 'node:path';

// ── 文件名 / 扩展名 ─────────────────────────────────────────

export function filenameFromUrl(url: string, contentDisposition?: string | null): string {
  if (contentDisposition) {
    const m =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
        contentDisposition,
      );
    const name = decodeURIComponent((m?.[1] || m?.[2] || m?.[3] || '').trim());
    if (name) return name.replace(/[\\/:*?"<>|]+/g, '_');
  }
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base !== '/' && base !== '.') {
      return decodeURIComponent(base).replace(/[\\/:*?"<>|]+/g, '_');
    }
  } catch {
    // ignore
  }
  return 'remote-content';
}

export function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

export function safeFilenameBase(name: string, fallback = 'remote'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/[^\w.\u4e00-\u9fa5-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

