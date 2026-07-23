import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  candidatesFromUrlList,
  parseFeedXml,
} from '../src/services/schedule/rss.js';

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Demo</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/a</link>
      <guid>https://example.com/a</guid>
      <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
      <description>Hello &amp; world</description>
    </item>
    <item>
      <title><![CDATA[Second <b>Post</b>]]></title>
      <link>https://example.com/b</link>
      <guid isPermaLink="false">id-2</guid>
    </item>
    <item>
      <title>bad</title>
      <link>not-a-url</link>
    </item>
  </channel>
</rss>`;

const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Demo</title>
  <entry>
    <title>Atom One</title>
    <id>urn:1</id>
    <link href="https://example.com/atom-1" rel="alternate"/>
    <updated>2026-01-02T00:00:00Z</updated>
    <summary>hi</summary>
  </entry>
</feed>`;

describe('schedule rss parse', () => {
  it('parses RSS items and skips invalid urls', () => {
    const items = parseFeedXml(sampleRss);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.url, 'https://example.com/a');
    assert.equal(items[0]!.title, 'First Post');
    assert.ok(items[0]!.key.startsWith('guid:'));
    assert.equal(items[1]!.title, 'Second Post');
  });

  it('parses Atom entries', () => {
    const items = parseFeedXml(sampleAtom);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.url, 'https://example.com/atom-1');
    assert.equal(items[0]!.title, 'Atom One');
  });

  it('builds url_list candidates with dedupe', () => {
    const items = candidatesFromUrlList([
      'https://example.com/1',
      'https://example.com/1',
      'ftp://x',
      'https://example.com/2',
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.url, 'https://example.com/1');
  });
});
