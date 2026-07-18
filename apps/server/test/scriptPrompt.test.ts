import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeScriptPrompt,
  summarizeScriptPrompt,
  hasScriptPrompt,
  resolveScriptMaxChars,
  DEFAULT_SCRIPT_MAX_CHARS,
} from '../src/services/content/scriptPrompt.js';

describe('scriptPrompt', () => {
  it('normalizes blank prompt to empty object fields', () => {
    const normalized = normalizeScriptPrompt({});
    assert.equal(hasScriptPrompt(normalized), false);
  });

  it('keeps host identity and max chars', () => {
    const normalized = normalizeScriptPrompt({
      hostName: ' 小白 ',
      hostIdentity: '科技主播',
      maxChars: '2000',
    });
    assert.equal(normalized.hostName, '小白');
    assert.equal(normalized.hostIdentity, '科技主播');
    assert.equal(resolveScriptMaxChars(normalized), 2000);
    assert.ok(hasScriptPrompt(normalized));
    const summary = summarizeScriptPrompt(normalized);
    assert.ok(summary.length > 0);
  });

  it('falls back to default max chars', () => {
    assert.equal(resolveScriptMaxChars(undefined), DEFAULT_SCRIPT_MAX_CHARS);
  });
});
