/**
 * 演示 Schedule 插件：不访问网络，只返回假条目
 * 导出：default 插件对象
 */
function clampCount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 2;
  return Math.min(5, Math.max(1, Math.floor(x)));
}

const plugin = {
  id: 'schedule.echo',
  name: 'Echo Schedule Plugin',
  description: '演示订阅插件：根据前缀生成若干假条目',
  version: '0.1.0',
  riskLevel: 'low',
  capabilities: ['poll', 'list'],
  defaultEnabled: false,

  isAvailable() {
    return true;
  },

  canHandle() {
    return true;
  },

  async fetch(input, ctx) {
    const prefix = String(ctx.getConfig('prefix') || input.params.prefix || 'Echo');
    const count = clampCount(
      input.params.count ?? ctx.getConfig('count') ?? input.maxItems,
    );
    const base =
      String(input.params.baseUrl || '').trim() ||
      'https://example.com/schedule-echo';
    const now = new Date().toISOString();
    const items = [];
    for (let i = 1; i <= count; i++) {
      const url = `${base}/${Date.now()}-${i}`;
      items.push({
        key: `echo:${prefix}:${i}:${now}`,
        url,
        title: `${prefix} #${i} @ ${now.slice(0, 16)}`,
        publishedAt: now,
        summary: `Echo schedule item ${i}`,
      });
    }
    return {
      items,
      strategy: 'echo',
      rawMeta: { prefix, count },
    };
  },
};

export default plugin;
