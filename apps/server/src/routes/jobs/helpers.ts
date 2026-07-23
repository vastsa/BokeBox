/**
 * 任务路由公共辅助：TTS/提示词解析、媒体发送、专辑挂载
 */
import path from 'node:path';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { ScriptPromptOptions, TtsMode, TtsOptions } from '../../types/job.js';
import {
  getGlobalScriptPrompt,
  getGlobalTtsOptions,
  normalizeTtsOptions,
} from '../../services/settings/index.js';
import { normalizeScriptPrompt } from '../../services/content/scriptPrompt.js';
import {
  getContentLocale,
} from '../../services/settings/index.js';
import {
  isContentLocale,
  type Locale,
} from '../../i18n/index.js';
import { ALLOWED_MEDIA_EXT } from '../../services/import/index.js';

/** 任务内容语言：请求指定优先，否则回落全局 contentLocale */
export function resolveJobLocale(raw: unknown): Locale {
  if (isContentLocale(raw)) return raw;
  const s = String(raw ?? '').trim();
  if (isContentLocale(s)) return s;
  return getContentLocale();
}

/** 本地上传：视频 / 音频 / 文本（与 URL 导入一致） */
export const ALLOWED_EXT = ALLOWED_MEDIA_EXT;

export const MAX_FILE_SIZE = 500 * 1024 * 1024;

export function parseTtsFromBody(fields: Record<string, unknown>): TtsOptions {
  // 优先读取整包 tts JSON，避免 multipart 漏字段时回落 default
  const fromJson = parseTtsJsonField(fields.tts);
  const modeRaw = String(
    fromJson?.mode || fields.ttsMode || fields.mode || 'default',
  );
  // 兼容历史 sing：映射为自然口播
  const mode = normalizeMode(modeRaw);
  const voiceRaw = String(
    fromJson?.voice || fields.voice || '',
  ).trim();
  return normalizeTts({
    mode,
    voice: voiceRaw || undefined,
    voiceDesign:
      fromJson?.voiceDesign ||
      (fields.voiceDesign ? String(fields.voiceDesign) : undefined),
    styleTags:
      fromJson?.styleTags ||
      parseStyleTagsField(fields.styleTags ?? fields.styleTag),
  });
}

/** 合法模式归一；历史 sing 回落自然口播 */
export function normalizeMode(raw?: string | null): TtsMode {
  const m = String(raw || 'default').trim();
  if (m === 'voicedesign') return 'voicedesign';
  // default / sing / 其他未知值 → 自然口播
  return 'default';
}

export function parseTtsJsonField(raw: unknown): Partial<TtsOptions> | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Partial<TtsOptions>;
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<TtsOptions>;
    }
  } catch {
    // ignore invalid json
  }
  return undefined;
}

export function parseStyleTagsField(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    const tags = raw.map((x) => String(x).trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  }
  const text = String(raw).trim();
  if (!text) return undefined;
  // 兼容 JSON 数组字符串或空格/逗号分隔
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        const tags = arr.map((x) => String(x).trim()).filter(Boolean);
        return tags.length ? tags : undefined;
      }
    } catch {
      // fallthrough
    }
  }
  const tags = text.split(/[\s,，、|]+/).map((s) => s.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

/** 统一归一化 TTS 配置：default 强制预置音色；不支持风格指令 */
export function normalizeTts(tts?: Partial<TtsOptions> | null): TtsOptions {
  return normalizeTtsOptions(tts);
}

/**
 * 解析任务级 TTS：
 * - ttsSourceMode=global（默认）：快照当前全局音色
 * - ttsSourceMode=custom：使用请求体自定义
 */
export function resolveTtsForJob(
  fields: Record<string, unknown>,
  explicit?: Partial<TtsOptions> | null,
): TtsOptions {
  const modeRaw = String(
    fields.ttsSourceMode || fields.ttsConfigMode || 'global',
  )
    .trim()
    .toLowerCase();
  const sourceMode = modeRaw === 'custom' ? 'custom' : 'global';

  if (sourceMode === 'custom') {
    if (explicit != null) return normalizeTts(explicit);
    return parseTtsFromBody(fields);
  }

  // 全局：任务创建时快照，保证重跑稳定
  return normalizeTts(getGlobalTtsOptions());
}


/** 解析 multipart / JSON 中的口播提示词干预 */
export function parseScriptPromptField(raw: unknown): ScriptPromptOptions | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeScriptPrompt(raw as Partial<ScriptPromptOptions>);
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeScriptPrompt(parsed as Partial<ScriptPromptOptions>);
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * 解析任务级口播提示词：
 * - mode=global（默认）：快照当前全局设置
 * - mode=custom：使用请求体自定义；空则表示无干预
 */
export function resolveScriptPromptForJob(
  fields: Record<string, unknown>,
  explicit?: ScriptPromptOptions | Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions | undefined {
  const modeRaw = String(
    fields.scriptPromptMode || fields.promptMode || 'global',
  )
    .trim()
    .toLowerCase();
  const mode = modeRaw === 'custom' ? 'custom' : 'global';

  if (mode === 'custom') {
    const custom =
      explicit != null
        ? normalizeScriptPrompt(explicit)
        : parseScriptPromptField(fields.scriptPrompt);
    return custom;
  }

  // 全局：任务创建时快照，保证重跑稳定
  return normalizeScriptPrompt(getGlobalScriptPrompt());
}

export function mediaTypeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * 支持 HTTP Range，浏览器音视频才能正常快进/拖动进度条。
 */
export async function sendMedia(
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  filePath: string,
  filename: string,
  download: boolean,
) {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  const type = mediaTypeOf(filePath);

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', type);
  reply.header(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // 有 query v= 做缓存破坏时，图片可长缓存；音频保持 1h
  const isImage = type.startsWith('image/');
  reply.header(
    'Cache-Control',
    isImage ? 'public, max-age=604800, immutable' : 'public, max-age=3600',
  );

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }

    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= size) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }
    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;

    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
    reply.header('Content-Length', chunkSize);
    return reply.send(createReadStream(filePath, { start, end }));
  }

  reply.header('Content-Length', size);
  return reply.send(createReadStream(filePath));
}

export { attachJobToAlbumIfNeeded } from '../../services/album/albumStore.js';

