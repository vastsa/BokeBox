import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Job } from '../src/types/job.js';
import { buildRetryPatch, stepIndex } from '../src/services/job/pipeline.js';

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 't',
    originalFilename: 'a.mp4',
    mimeType: 'video/mp4',
    size: 1,
    status: 'done',
    progress: 100,
    message: 'ok',
    videoPath: '/v',
    audioPath: '/a',
    podcastAudioPath: '/p',
    transcript: 'tx',
    podcast: {
      title: 'p',
      summary: 's',
      tags: [],
      hostIntro: 'h',
      outline: [],
      script: 'script',
      showNotes: 'n',
      flashcards: [{ id: '1', front: 'f', back: 'b' }],
      estimatedMinutes: 3,
      hasCoverImage: true,
    },
    published: true,
    sourceKind: 'video',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildRetryPatch', () => {
  it('extract clears intermediate artifacts', () => {
    const patch = buildRetryPatch(job(), 'extract', undefined, undefined, 'zh-CN');
    assert.equal(patch.status, 'queued');
    assert.equal(patch.audioPath, undefined);
    assert.equal(patch.transcript, undefined);
    assert.equal(patch.podcast, undefined);
    assert.equal(patch.podcastAudioPath, undefined);
  });

  it('script keeps transcript/audio and drops podcast', () => {
    const patch = buildRetryPatch(job(), 'script', { mode: 'default' }, undefined, 'zh-CN');
    assert.equal(patch.podcast, undefined);
    assert.equal(patch.podcastAudioPath, undefined);
    assert.deepEqual(patch.tts, { mode: 'default' });
    // should not clear audioPath field when starting from script
    assert.equal('audioPath' in patch, false);
  });

  it('cover only flips hasCoverImage', () => {
    const patch = buildRetryPatch(job(), 'cover', undefined, undefined, 'zh-CN');
    assert.equal(patch.podcast?.hasCoverImage, false);
    assert.equal(patch.podcast?.script, 'script');
    assert.equal(patch.podcastAudioPath, undefined);
  });

  it('flashcards drops cards but keeps script', () => {
    const patch = buildRetryPatch(job(), 'flashcards', undefined, undefined, 'zh-CN');
    assert.equal(patch.podcast?.flashcards, undefined);
    assert.equal(patch.podcast?.script, 'script');
  });

  it('synthesize only clears podcast audio path', () => {
    const patch = buildRetryPatch(job(), 'synthesize', undefined, undefined, 'zh-CN');
    assert.equal(patch.podcastAudioPath, undefined);
    assert.equal('podcast' in patch, false);
  });

  it('stepIndex is stable', () => {
    assert.equal(stepIndex('extract'), 0);
    assert.equal(stepIndex('synthesize'), 5);
  });
});
