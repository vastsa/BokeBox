import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPlannedStyleToSentence,
  planSentenceStyleTags,
} from '../src/providers/tts/styleTagPlanner.js';

describe('styleTagPlanner', () => {
  it('uses preferred style as base without forcing control on neutral sentences', () => {
    const plan = planSentenceStyleTags('接下来继续同步产品进展。', {
      preferredStyle: ['沉稳'],
      index: 1,
      total: 5,
    });
    assert.equal(plan.styleTags[0], '沉稳');
    assert.ok(plan.styleTags.length <= 2);
    assert.deepEqual(plan.controlTags, []);
  });

  it('adds laugh cue for humorous sentences', () => {
    const plan = planSentenceStyleTags('这个反转也太好笑了，我直接笑死。', {
      preferredStyle: ['沉稳'],
    });
    assert.ok(plan.styleTags.includes('沉稳') || plan.styleTags.includes('欢快'));
    assert.ok(plan.controlTags.includes('轻笑'));
  });

  it('marks serious conclusions', () => {
    const plan = planSentenceStyleTags('请务必注意这个关键风险。', {
      preferredStyle: ['磁性'],
    });
    assert.ok(plan.styleTags.includes('磁性') || plan.styleTags.includes('沉稳'));
    assert.ok(plan.controlTags.includes('郑重'));
  });

  it('adds opening breath on first sentence fallback', () => {
    const plan = planSentenceStyleTags('这里是普通过渡说明。', {
      preferredStyle: ['温柔'],
      index: 0,
      total: 4,
    });
    assert.deepEqual(plan.styleTags.slice(0, 1), ['温柔']);
    assert.ok(plan.controlTags.includes('深呼吸'));
  });

  it('writes different tags onto different sentences', () => {
    const a = applyPlannedStyleToSentence(
      '大家好，欢迎回来。',
      planSentenceStyleTags('大家好，欢迎回来。', {
        preferredStyle: ['沉稳'],
        index: 0,
        total: 3,
      }),
    );
    const b = applyPlannedStyleToSentence(
      '结论很重要，务必记住。',
      planSentenceStyleTags('结论很重要，务必记住。', {
        preferredStyle: ['沉稳'],
        index: 1,
        total: 3,
      }),
    );
    const c = applyPlannedStyleToSentence(
      '我们下期见。',
      planSentenceStyleTags('我们下期见。', {
        preferredStyle: ['沉稳'],
        index: 2,
        total: 3,
      }),
    );
    assert.match(a, /深呼吸|清亮|沉稳/);
    assert.match(b, /郑重|沉稳/);
    assert.match(c, /轻笑|温柔|沉稳/);
    assert.notEqual(a, b);
    assert.notEqual(b, c);
  });

  it('does not duplicate existing control tags in sentence', () => {
    const plan = planSentenceStyleTags('（轻笑）这个玩笑有点好笑。', {
      preferredStyle: ['欢快'],
    });
    assert.equal(plan.controlTags.includes('轻笑'), false);
  });
});
