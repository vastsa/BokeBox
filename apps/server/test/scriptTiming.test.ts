import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isValidScriptTimingRows,
  parseScriptLines,
  stripAudioTags,
  type ScriptLineTiming,
} from '@bokebox/shared';
import { splitScriptWithRanges } from '../src/providers/tts/audioUtils.js';
import {
  buildScriptTiming,
  isValidScriptTimingFile,
  parseScriptLinesDetailed,
} from '../src/services/job/scriptTiming.js';
import {
  prepareScriptForTtsProvider,
  providerAcceptsAudioTags,
} from '../src/services/media/ttsSynthesizer.js';
import {
  activeLineIndexForTimeline,
  resolveScriptTimeline,
} from '../../web/src/lib/scriptFollow.js';

function assertTimelineInvariant(
  timing: ReturnType<typeof buildScriptTiming>,
): void {
  let previousEnd = 0;
  for (const row of timing.lines) {
    assert.ok(Number.isFinite(row.startSec));
    assert.ok(Number.isFinite(row.endSec));
    assert.ok(row.startSec >= previousEnd - 0.001);
    assert.ok(row.endSec > row.startSec);
    assert.ok(row.endSec <= timing.durationSec + 0.001);
    previousEnd = row.endSec;
  }
  assert.equal(timing.lines.at(-1)?.endSec, timing.durationSec);
}

describe('script timing contract', () => {
  it('only removes explicit audio tags and keeps code or normal brackets', () => {
    const script =
      '(磁性 沉稳)开场。COUNT(CASE WHEN status=1 THEN 1 END) 保留；' +
      '数组[0]保留。说明（生产推荐）也保留。（深呼吸）继续。' +
      '（沉稳 恳切）结尾。（收尾）';
    const plain = stripAudioTags(script);

    assert.equal(plain.includes('磁性 沉稳'), false);
    assert.equal(plain.includes('深呼吸'), false);
    assert.equal(plain.includes('沉稳 恳切'), false);
    assert.equal(plain.includes('收尾'), false);
    assert.ok(plain.includes('COUNT(CASE WHEN status=1 THEN 1 END)'));
    assert.ok(plain.includes('数组[0]'));
    assert.ok(plain.includes('说明（生产推荐）'));
    assert.equal(parseScriptLines(script).some((line) => line.text === '。'), false);
  });

  it('shares exactly the same parser between server and clients', () => {
    const script =
      '（轻笑）先讲 CString cstr(stdStr.c_str());。\n\n' +
      '再讲 setTimeout(computeFrame, 0) 和 std::bind;。';
    assert.deepEqual(parseScriptLinesDetailed(script), parseScriptLines(script));
  });

  it('prepares provider input according to style-tag capability', () => {
    const script = '（轻笑）正文 COUNT(CASE WHEN ok=1 THEN 1 END)。';
    assert.equal(prepareScriptForTtsProvider(script, true), script);
    const edgeText = prepareScriptForTtsProvider(script, false);
    assert.equal(edgeText.includes('轻笑'), false);
    assert.ok(edgeText.includes('COUNT(CASE WHEN ok=1 THEN 1 END)'));
    assert.equal(providerAcceptsAudioTags(true, 'default'), true);
    assert.equal(providerAcceptsAudioTags(true, 'voicedesign'), false);
    assert.equal(providerAcceptsAudioTags(false, 'default'), false);
  });

  it('keeps every parsed line exactly once across ranged chunks', () => {
    const script =
      '第一句内容。第二句内容。\n\n第三句内容。第四句内容。\n第五句内容。';
    const chunks = splitScriptWithRanges(script, 18);
    const durationSec = chunks.length * 4;
    const timing = buildScriptTiming({
      script,
      durationSec,
      chunks: chunks.map((chunk) => ({
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        durationSec: 4,
      })),
    });
    const expected = parseScriptLines(script).map((line) => line.text);

    assert.equal(timing.source, 'measured');
    assert.deepEqual(
      timing.lines.map((line) => line.text),
      expected,
    );
    assert.equal(new Set(timing.lines.map((line) => line.text)).size, expected.length);
    assertTimelineInvariant(timing);
  });

  it('maps identical repeated lines by source range instead of text lookup', () => {
    const script = '重复句。\n\n重复句。\n收尾句。';
    const chunks = splitScriptWithRanges(script, 6);
    const timing = buildScriptTiming({
      script,
      durationSec: chunks.length * 2,
      chunks: chunks.map((chunk) => ({
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        durationSec: 2,
      })),
    });

    assert.equal(timing.source, 'measured');
    assert.deepEqual(
      timing.lines.map((line) => line.text),
      ['重复句。', '重复句。', '收尾句。'],
    );
    assertTimelineInvariant(timing);
  });

  it('never creates reversed ranges when duration is shorter than line count', () => {
    const script = Array.from(
      { length: 15 },
      (_, index) => '第' + (index + 1) + '句口播内容。',
    ).join('\n');
    const timing = buildScriptTiming({
      script,
      durationSec: 1,
      silences: [
        { start: 0.12, end: 0.2 },
        { start: 0.54, end: 0.68 },
      ],
    });

    assert.equal(timing.lines.length, 15);
    assertTimelineInvariant(timing);
    assert.ok(isValidScriptTimingFile(timing, parseScriptLines(script)));
  });

  it('rejects reversed or same-length semantically mismatched timing', () => {
    const expected = parseScriptLines('第一句。第二句。第三句。');
    const reversed: ScriptLineTiming[] = [
      { text: '第一句。', startSec: 0, endSec: 1 },
      { text: '第二句。', startSec: 1, endSec: 2 },
      { text: '第三句。', startSec: 2, endSec: 1 },
    ];
    const mismatched: ScriptLineTiming[] = [
      { text: '第一句。', startSec: 0, endSec: 1 },
      { text: '重复句。', startSec: 1, endSec: 2 },
      { text: '第三句。', startSec: 2, endSec: 3 },
    ];

    assert.equal(isValidScriptTimingRows(reversed, expected), false);
    assert.equal(isValidScriptTimingRows(mismatched, expected), false);
  });

  it('falls back from a damaged timeline using the real media duration', () => {
    const parsed = parseScriptLines('第一句。第二句。第三句。');
    const damaged: ScriptLineTiming[] = [
      { text: '第一句。', startSec: 0, endSec: 0.18 },
      { text: '第二句。', startSec: 0.18, endSec: 1.62 },
      { text: '第三句。', startSec: 1.62, endSec: 1 },
    ];
    const resolved = resolveScriptTimeline(
      parsed,
      60,
      damaged,
      'silence-aligned',
    );

    assert.equal(resolved.source, 'estimated');
    assert.equal(resolved.usedProvidedTiming, false);
    assert.equal(resolved.lines.at(-1)?.endSec, 60);
    assert.equal(activeLineIndexForTimeline(resolved.lines, 59.9), 2);
    assert.ok(resolved.lines.every((line) => line.startSec <= 60));
  });

  it('rejects a semantically valid timeline with a wildly wrong total duration', () => {
    const parsed = parseScriptLines('第一句。第二句。第三句。');
    const compressed: ScriptLineTiming[] = [
      { text: '第一句。', startSec: 0, endSec: 0.3 },
      { text: '第二句。', startSec: 0.3, endSec: 0.6 },
      { text: '第三句。', startSec: 0.6, endSec: 1 },
    ];
    const resolved = resolveScriptTimeline(
      parsed,
      60,
      compressed,
      'silence-aligned',
    );

    assert.equal(resolved.usedProvidedTiming, false);
    assert.equal(resolved.source, 'estimated');
    assert.equal(resolved.lines.at(-1)?.endSec, 60);
  });
});
