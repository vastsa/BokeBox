import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGithubTrendingHtml } from '../src/services/schedule/plugins/builtinGithubTrending.js';
import {
  ensureBuiltinSchedulePlugins,
} from '../src/services/schedule/plugins/host.js';
import { getSchedulePlugin } from '../src/services/schedule/plugins/registry.js';

describe('builtin github trending parse', () => {
  it('extracts repo cards', () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/foo/bar">foo / bar</a></h2>
        <p class="col-9 color-fg-muted my-1 pr-4">A cool repo</p>
      </article>
      <article class="Box-row">
        <h2><a href="/a/b">a / b</a></h2>
      </article>
    `;
    const items = parseGithubTrendingHtml(html);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.url, 'https://github.com/foo/bar');
    assert.equal(items[0]!.key, 'gh-trend:foo/bar');
    assert.equal(items[0]!.title, 'foo/bar');
  });
});

describe('builtin feed plugins registered', () => {
  it('registers github-trending and hacker-news', () => {
    ensureBuiltinSchedulePlugins();
    assert.ok(getSchedulePlugin('schedule.github-trending'));
    assert.ok(getSchedulePlugin('schedule.hacker-news'));
    assert.equal(
      getSchedulePlugin('schedule.github-trending')!.defaultEnabled,
      true,
    );
    assert.equal(
      getSchedulePlugin('schedule.hacker-news')!.defaultEnabled,
      true,
    );
  });
});
