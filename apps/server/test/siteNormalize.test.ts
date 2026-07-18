import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SEO_TITLE,
  DEFAULT_SITE_SEO_INPUT,
  SITE_ATTRIBUTION,
  SITE_GITHUB_URL,
  buildPublicSiteSeo,
  buildSeoTitle,
  formatSiteTitle,
  normalizeSeoDescription,
  normalizeSeoKeywords,
  normalizeSeoTitle,
  normalizeSiteName,
  withSeoAttribution,
} from '../src/services/settings/site.js';

describe('site normalize', () => {
  it('normalizeSiteName strips brand suffix and clamps length', () => {
    assert.equal(normalizeSiteName('  我的播客  '), '我的播客');
    assert.equal(normalizeSiteName('我的播客 - BokeBox'), '我的播客');
    assert.equal(normalizeSiteName('我的播客-BokeBox'), '我的播客');
    assert.equal(normalizeSiteName('BokeBox'), '');
    assert.equal(normalizeSiteName('   '), '');
    const long = '甲'.repeat(80);
    assert.equal(normalizeSiteName(long).length, 48);
  });

  it('formatSiteTitle appends brand when custom name exists', () => {
    assert.equal(formatSiteTitle(''), 'BokeBox');
    assert.equal(formatSiteTitle('夜航'), '夜航 - BokeBox');
    assert.equal(formatSiteTitle('夜航 - BokeBox'), '夜航 - BokeBox');
  });

  it('normalizeSeo* cleans attribution and keywords', () => {
    assert.equal(normalizeSeoTitle('深度长文 - BokeBox'), '深度长文');
    assert.equal(
      normalizeSeoDescription(
        `简介 · Powered by BokeBox · ${SITE_GITHUB_URL}`,
      ),
      '简介',
    );
    assert.equal(
      normalizeSeoKeywords('AI, ai, 播客，播客、MCP'),
      'AI, 播客, MCP',
    );
  });

  it('withSeoAttribution always keeps powered-by footer', () => {
    assert.equal(withSeoAttribution(''), SITE_ATTRIBUTION);
    assert.equal(
      withSeoAttribution('私人 AI 播客'),
      `私人 AI 播客 · ${SITE_ATTRIBUTION}`,
    );
    assert.match(withSeoAttribution('x'), /github\.com\/vastsa\/BokeBox/);
  });

  it('buildSeoTitle prefers custom seo title then explicit site title', () => {
    assert.equal(
      buildSeoTitle({ title: '专题', description: '', keywords: '' }),
      '专题 - BokeBox',
    );
    assert.equal(
      buildSeoTitle({ title: '', description: '', keywords: '' }, '夜航 - BokeBox'),
      '夜航 - BokeBox',
    );
    // 未自定义标题时 formatSiteTitle 空名回落品牌
    assert.equal(formatSiteTitle(''), 'BokeBox');
    assert.equal(DEFAULT_SEO_TITLE.includes('BokeBox'), true);
  });

  it('buildPublicSiteSeo fills defaults and attribution', () => {
    const pub = buildPublicSiteSeo({
      title: '专题页',
      description: '',
      keywords: '',
    });
    assert.equal(pub.title, '专题页 - BokeBox');
    assert.ok(pub.description.includes(DEFAULT_SITE_SEO_INPUT.description.slice(0, 12)));
    assert.ok(pub.description.includes(SITE_ATTRIBUTION));
    assert.equal(pub.github, SITE_GITHUB_URL);
    assert.equal(pub.attribution, SITE_ATTRIBUTION);
    assert.ok(pub.keywords.includes('BokeBox'));
  });
});
