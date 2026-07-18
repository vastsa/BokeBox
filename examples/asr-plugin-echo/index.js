/**
 * BokeBox ASR 插件示例
 * 安装：
 *   cp -R examples/asr-plugin-echo storage/plugins/asr/echo-asr
 *   curl -X POST http://localhost:8787/api/asr-plugins/rescan
 *   curl -X PATCH http://localhost:8787/api/asr-plugins/asr.echo \
 *     -H 'Content-Type: application/json' -d '{"enabled":true}'
 * 设置 asrProvider=asr.echo 后生效
 */
const plugin = {
  id: 'asr.echo',
  name: 'Echo ASR',
  description: '演示 ASR：返回固定转写稿',
  version: '0.1.0',
  riskLevel: 'low',
  defaultEnabled: false,
  suggestedModel: 'echo',
  isAvailable() {
    return true;
  },
  async transcribe(input, ctx) {
    const prefix = String(ctx?.getConfig?.('prefix') ?? ctx?.config?.prefix ?? 'EchoASR');
    const name = String(input?.audioPath || 'audio').split(/[\\/]/).pop();
    return {
      text: [
        `【${prefix}】演示转写`,
        `文件：${name}`,
        '这是一段由 asr.echo 插件生成的固定文稿。',
        `at=${new Date().toISOString()}`,
      ].join('\n'),
      provider: 'asr.echo',
      model: 'echo',
      demo: true,
    };
  },
};

export default plugin;
