import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureBuiltinSchedulePlugins,
  listSchedulePluginsPublic,
} from '../src/services/schedule/plugins/host.js';
import {
  getSchedulePlugin,
  isSchedulePluginEnabled,
} from '../src/services/schedule/plugins/registry.js';

describe('schedule plugins builtins', () => {
  it('registers rss and url-list builtins', () => {
    ensureBuiltinSchedulePlugins();
    const rss = getSchedulePlugin('schedule.rss');
    const list = getSchedulePlugin('schedule.url-list');
    assert.ok(rss);
    assert.ok(list);
    assert.equal(isSchedulePluginEnabled('schedule.rss'), true);
    assert.equal(isSchedulePluginEnabled('schedule.url-list'), true);
    const pub = listSchedulePluginsPublic();
    assert.ok(pub.some((p) => p.id === 'schedule.rss'));
    assert.ok(pub.some((p) => p.id === 'schedule.url-list'));
  });

  it('url-list canHandle and fetch', async () => {
    ensureBuiltinSchedulePlugins();
    const plugin = getSchedulePlugin('schedule.url-list')!;
    const input = {
      params: {
        urls: ['https://example.com/a', 'https://example.com/a', 'bad'],
      },
      maxItems: 3,
      timezone: 'Asia/Shanghai',
    };
    const ctx = {
      scheduleId: 's1',
      scheduleName: 't',
      storageDir: '/tmp',
      config: {},
      getConfig: () => undefined,
      safeFetch: async () => new Response(''),
    };
    assert.equal(plugin.canHandle(input, ctx), true);
    const res = await plugin.fetch(input, ctx);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0]!.url, 'https://example.com/a');
  });
});
