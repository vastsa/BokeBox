/**
 * BokeBox Source 插件示例（ESM）
 *
 * 安装：
 *   cp -R examples/source-plugin-echo storage/plugins/source/echo
 *   curl -X POST http://localhost:8787/api/source-plugins/rescan
 *   curl -X PUT http://localhost:8787/api/source-plugins/source.echo/config \
 *     -H 'Content-Type: application/json' \
 *     -d '{"config":{"token":"demo-token","prefix":"Echo"}}'
 *   curl -X PATCH http://localhost:8787/api/source-plugins/source.echo \
 *     -H 'Content-Type: application/json' \
 *     -d '{"enabled":true}'
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const plugin = {
  id: 'source.echo',
  name: 'Echo Test Plugin',
  description: '演示插件：将 URL 写成本地文本，可读取后台配置的 token/prefix',
  version: '0.2.0',
  riskLevel: 'low',
  capabilities: ['url'],
  defaultEnabled: false,
  // 也可在运行时声明；plugin.json 的 configSchema 会与之合并
  configSchema: [
    {
      key: 'token',
      label: '访问令牌',
      type: 'password',
      required: false,
      description: '可选演示字段',
    },
    {
      key: 'prefix',
      label: '标题前缀',
      type: 'string',
      required: false,
      default: 'Echo',
    },
  ],
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
    const prefix = String(ctx.getConfig?.('prefix') ?? ctx.config?.prefix ?? 'Echo');
    const token = String(ctx.getConfig?.('token') ?? ctx.config?.token ?? '');
    const text = [
      `# ${prefix} Source Plugin`,
      '',
      body,
      '',
      `jobId=${jobId}`,
      token ? `tokenSet=yes (len=${token.length})` : 'tokenSet=no',
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
      title: `${prefix}: ${body.slice(0, 40) || 'echo'}`,
      sourceUrl: input.url,
      pluginId: 'source.echo',
      strategy: 'echo',
    };
  },
};

export default plugin;
export { plugin };
