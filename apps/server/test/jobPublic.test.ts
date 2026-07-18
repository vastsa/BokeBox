import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Job } from '../src/types/job.js';
import {
  isPubliclyListenable,
  slimPodcastForList,
  toGuestListPublic,
  toGuestPublic,
  toListPublic,
  toPublic,
} from '../src/services/job/jobStore.js';

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: '标题',
    originalFilename: 'a.mp4',
    mimeType: 'video/mp4',
    size: 1024,
    status: 'done',
    progress: 100,
    message: '完成',
    videoPath: '/tmp/a.mp4',
    audioPath: '/tmp/a.mp3',
    podcastAudioPath: '/tmp/p.mp3',
    transcript: '原文很长',
    podcast: {
      title: '播客标题',
      summary: '摘要',
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      hostIntro: '介绍',
      outline: [{ title: '一', summary: 's' }],
      script: '口播稿' + 'x'.repeat(20),
      showNotes: '# notes',
      estimatedMinutes: 12,
      hasCoverImage: true,
      coverGradient: 'g1',
    },
    published: true,
    sourceKind: 'video',
    sourceUrl: 'https://example.com/a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('job public mappers', () => {
  it('toPublic hides paths and exposes capability flags', () => {
    const pub = toPublic(baseJob());
    assert.equal('videoPath' in pub, false);
    assert.equal(pub.hasVideo, true);
    assert.equal(pub.hasSourceAudio, true);
    assert.equal(pub.hasPodcastAudio, true);
    assert.equal(pub.hasTranscript, true);
  });

  it('toGuestPublic strips management fields', () => {
    const guest = toGuestPublic(baseJob());
    assert.equal(guest.transcript, undefined);
    assert.equal(guest.sourceUrl, undefined);
    assert.equal(guest.hasTranscript, false);
    assert.equal(guest.originalFilename, '');
  });

  it('slimPodcastForList keeps card fields only', () => {
    const slim = slimPodcastForList(baseJob().podcast);
    assert.ok(slim);
    assert.equal(slim!.title, '播客标题');
    assert.ok((slim!.tags || []).length <= 6);
    assert.equal((slim as { script?: string }).script, undefined);
    assert.equal((slim as { showNotes?: string }).showNotes, undefined);
  });

  it('toListPublic omits finished progress and marks audio', () => {
    const list = toListPublic(baseJob());
    assert.equal((list as { progress?: number }).progress, undefined);
    assert.equal(list.hasPodcastAudio, true);
    assert.equal(list.podcast?.title, '播客标题');
  });

  it('toGuestListPublic removes source metadata', () => {
    const guest = toGuestListPublic(baseJob());
    assert.equal((guest as { sourceUrl?: string }).sourceUrl, undefined);
    assert.equal((guest as { originalFilename?: string }).originalFilename, undefined);
  });

  it('isPubliclyListenable requires done + podcast + published', () => {
    assert.equal(isPubliclyListenable(baseJob()), true);
    assert.equal(isPubliclyListenable(baseJob({ published: false })), false);
    assert.equal(isPubliclyListenable(baseJob({ status: 'queued' })), false);
    assert.equal(isPubliclyListenable(baseJob({ podcast: undefined })), false);
  });
});
