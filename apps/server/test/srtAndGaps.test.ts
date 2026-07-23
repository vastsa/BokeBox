import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSilentWav,
  mergeWavBuffersWithGaps,
  wavDurationSec,
} from '../src/providers/tts/audioUtils.js';
import {
  buildSrtFromTiming,
  buildScriptTimingFromSpeechRanges,
  formatSrtTimestamp,
  isValidScriptTimingFile,
} from '../src/services/job/scriptTiming.js';

describe('sentence gap merge', () => {
  it('inserts silence between wav sentences and reports speech ranges', () => {
    const a = createSilentWav(0.2, { channels: 1, sampleRate: 24000, bitsPerSample: 16 });
    // not silence for identity - still valid wav duration
    const b = createSilentWav(0.3, { channels: 1, sampleRate: 24000, bitsPerSample: 16 });
    const merged = mergeWavBuffersWithGaps([a, b], 0.25);
    assert.equal(merged.speechRanges.length, 2);
    assert.ok(Math.abs(merged.speechRanges[0].endSec - 0.2) < 0.02);
    assert.ok(Math.abs(merged.speechRanges[1].startSec - 0.45) < 0.03);
    assert.ok(Math.abs(merged.totalDurationSec - 0.75) < 0.04);
    assert.ok(wavDurationSec(merged.audio) > 0.7);
  });
});

describe('srt export', () => {
  it('formats timestamps and builds srt cues', () => {
    assert.equal(formatSrtTimestamp(65.5), '00:01:05,500');
    const body = buildSrtFromTiming([
      { text: '（轻笑）第一句。', startSec: 0, endSec: 1.2 },
      { text: '第二句。', startSec: 1.5, endSec: 2.8 },
    ]);
    assert.match(body, /1\n00:00:00,000 --> 00:00:01,200\n第一句。/);
    assert.match(body, /2\n00:00:01,500 --> 00:00:02,800\n第二句。/);
    assert.equal(body.includes('轻笑'), false);
  });

  it('builds measured timing from speech ranges with gaps', () => {
    const timing = buildScriptTimingFromSpeechRanges({
      script: '第一句。第二句。第三句。',
      speechRanges: [
        { startSec: 0, endSec: 1 },
        { startSec: 1.32, endSec: 2.1 },
        { startSec: 2.42, endSec: 3.0 },
      ],
      gapSec: 0.32,
      durationSec: 3.32, // 末句后无 gap，但总时长可能来自 probe；末句 end 需贴合 duration
    });
    assert.equal(timing.source, 'measured');
    assert.equal(timing.lines.length, 3);
    assert.equal(timing.lines[0].text, '第一句。');
    assert.equal(timing.lines[0].startSec, 0);
    assert.equal(timing.lines[1].startSec, 1.32);
    assert.equal(timing.lines[2].endSec, 3.32);
    assert.equal(timing.durationSec, 3.32);
    assert.equal(isValidScriptTimingFile(timing), true);
  });

  it('maps mismatched sentence counts without failing validation shape', () => {
    const timing = buildScriptTimingFromSpeechRanges({
      script: '第一句。第二句。第三句。第四句。',
      speechRanges: [
        { startSec: 0, endSec: 1 },
        { startSec: 1.3, endSec: 2.0 },
      ],
      durationSec: 4,
    });
    assert.equal(timing.lines.length, 4);
    assert.equal(timing.lines[0].startSec, 0);
    assert.equal(timing.lines.at(-1)?.endSec, 4);
    assert.equal(timing.source, 'measured');
    assert.equal(isValidScriptTimingFile(timing), true);
  });
});
