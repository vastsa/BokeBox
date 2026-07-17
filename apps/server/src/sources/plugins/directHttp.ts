/**
 * 内置 Source 插件：direct-http
 *
 * 能力：公开 http(s) 直链媒体下载 + 简易网页正文提取。
 * 实现复用既有 urlImporter，不引入 yt-dlp / 第三方爬虫。
 */
import {
  importUrlContent,
  isValidHttpUrl,
} from '../../services/urlImporter.js';
import type {
  SourceArtifact,
  SourceInput,
  SourcePlugin,
  SourcePluginContext,
  SourceProbe,
} from '../types.js';

export const DIRECT_HTTP_PLUGIN_ID = 'direct-http';

export const directHttpSourcePlugin: SourcePlugin = {
  id: DIRECT_HTTP_PLUGIN_ID,
  name: 'Direct HTTP',
  description: '公开 http(s) 直链媒体下载与简易网页正文提取（内置，低风险）',
  version: '1.0.0',
  riskLevel: 'low',
  capabilities: ['url', 'webpage', 'media'],
  defaultEnabled: true,

  isAvailable() {
    return true;
  },

  canHandle(input: SourceInput): boolean {
    if (input.type !== 'url') return false;
    return isValidHttpUrl(input.url);
  },

  async probe(input: SourceInput, _ctx: SourcePluginContext): Promise<SourceProbe> {
    if (!this.canHandle(input)) {
      return { handled: false, message: '仅支持有效的 http/https URL' };
    }
    return { handled: true };
  },

  async fetch(input: SourceInput, ctx: SourcePluginContext): Promise<SourceArtifact> {
    if (input.type !== 'url') {
      throw new Error('direct-http 仅支持 URL 输入');
    }
    if (!isValidHttpUrl(input.url)) {
      throw new Error('请输入有效的 http/https 链接');
    }

    const jobId = input.jobId || ctx.jobId;
    const imported = await importUrlContent(input.url, jobId);

    return {
      kind: imported.kind,
      localPath: imported.sourcePath,
      mimeType: imported.mimeType,
      size: imported.size,
      filename: imported.filename,
      textContent: imported.textContent,
      title: imported.title,
      sourceUrl: imported.finalUrl || input.url,
      pluginId: DIRECT_HTTP_PLUGIN_ID,
      strategy: 'urlImporter',
      rawMeta: {
        finalUrl: imported.finalUrl,
      },
    };
  },
};
