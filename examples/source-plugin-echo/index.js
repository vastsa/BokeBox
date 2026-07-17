/**
 * BokeBox Source 插件示例（ESM）
 *
 * 安装：
 *   cp -R examples/source-plugin-echo storage/plugins/source/echo
 *   curl -X POST http://localhost:8787/api/source-plugins/rescan
 *   curl -X PATCH http://localhost:8787/api/source-plugins/source.echo \
 *     -H 'Content-Type: application/json' \
 *     -d '{"enabled":true}'
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const plugin = {
  id: 'source.echo',
  name: 'Echo Test Plugin',
  description: '演示插件：将 URL 写成本地文本，不进行网络抓取',
  version: '0.1.0',
  riskLevel: 'low',
  capabilities: ['url'],
  defaultEnabled: false,
  isAvailable() {
    return true;
  },
  canHandle(input) {
    return (
      input?.type === 'url' &&
      typeof input.url === 'string' &&
      input.url.startsWith('echo:')
    );
  },
  async probe(input) {
    if (!this.canHandle(input)) return { handled: false };
    return { handled: true, title: input.url.slice('echo:'.length) || 'echo' };
  },
  async fetch(input, ctx) {
    if (!this.canHandle(input)) {
      throw new Error('echo 插件仅处理 echo: 前缀 URL');
    }
    const jobId = input.jobId || ctx.jobId;
    const body = input.url.slice('echo:'.length) || '(empty)';
    const text = [
      '# Echo Source Plugin',
      '',
      body,
      '',
      `jobId=${jobId}`,
      `at=${new Date().toISOString()}`,
    ].join('\n');

    const baseDir =
      ctx.jobDir || path.join(ctx.storageDir || process.cwd(), 'jobs', jobId);
    const localPath = path.join(baseDir, 'source.echo.txt');
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, text, 'utf8');

    return {
      kind: 'text',
      localPath,
      mimeType: 'text/plain',
      size: Buffer.byteLength(text, 'utf8'),
      filename: 'echo.txt',
      textContent: text,
      title: body.slice(0, 40) || 'echo',
      sourceUrl: input.url,
      pluginId: 'source.echo',
      strategy: 'echo',
    };
  },
};

export default plugin;
export { plugin };
