import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAssistantStyleTags,
  buildMimoTtsBody,
  pickCloneAudioSource,
  resolveCloneAudioFilePath,
} from '../src/providers/tts/mimoTts.js';

describe('mimo voiceclone body', () => {
  it('builds clone request with data URI voice and empty user prompt', () => {
    const dataUri = 'data:audio/mpeg;base64,AAA';
    const body = buildMimoTtsBody(
      'Hello world.',
      { mode: 'voiceclone', voice: dataUri },
      { cloneVoiceDataUri: dataUri, clonePrompt: '' },
    );
    assert.equal(body.resolvedMode, 'voiceclone');
    assert.equal(body.model, 'mimo-v2.5-tts-voiceclone');
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0]!.role, 'user');
    assert.equal(body.messages[0]!.content, '');
    assert.equal(body.messages[1]!.role, 'assistant');
    assert.equal(body.messages[1]!.content, 'Hello world.');
    assert.equal(body.audio.format, 'wav');
    assert.equal(body.audio.voice, dataUri);
  });

  it('default mode still uses preset voice', () => {
    const body = buildMimoTtsBody(
      '大家好',
      { mode: 'default', voice: '冰糖' },
      { model: 'mimo-v2.5-tts' },
    );
    assert.equal(body.resolvedMode, 'default');
    assert.equal(body.audio.voice, '冰糖');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0]!.role, 'assistant');
  });

  it('pickCloneAudioSource prefers task voice over config path', () => {
    const src = pickCloneAudioSource(
      { mode: 'voiceclone', voice: 'samples/a.mp3' },
      {
        storageDir: '/tmp',
        config: {},
        getConfig: (k: string) =>
          k === 'cloneAudioPath' ? 'samples/default.mp3' : undefined,
      },
    );
    assert.equal(src, 'samples/a.mp3');
  });

  it('pickCloneAudioSource ignores preset voice names', () => {
    const src = pickCloneAudioSource(
      { mode: 'voiceclone', voice: '冰糖' },
      {
        storageDir: '/tmp',
        config: {},
        getConfig: (k: string) =>
          k === 'cloneAudioPath' ? 'samples/default.mp3' : undefined,
      },
    );
    assert.equal(src, 'samples/default.mp3');
  });

  it('resolveCloneAudioFilePath joins storageDir', () => {
    const p = resolveCloneAudioFilePath('samples/x.mp3', '/data/storage');
    assert.ok(p.endsWith('/data/storage/samples/x.mp3') || p.includes('samples/x.mp3'));
  });
});

describe('mimo voiceclone cache', () => {
  it('toCloneVoiceDataUri reuses data URI cache', async () => {
    const { toCloneVoiceDataUri } = await import('../src/providers/tts/mimoTts.js');
    const uri = 'data:audio/mpeg;base64,QUJDRA==';
    const a = await toCloneVoiceDataUri(uri);
    const b = await toCloneVoiceDataUri(uri);
    assert.equal(a, b);
    assert.ok(a.startsWith('data:audio/mpeg;base64,'));
  });
});


describe('mimo style tags per sentence', () => {
  it('injects style tags when applyLeadingStyle is true', () => {
    const out = applyAssistantStyleTags('今天天气不错。', {
      styleTags: ['轻快', '微笑'],
      applyLeadingStyle: true,
    });
    assert.equal(out, '(轻快 微笑)今天天气不错。');
  });

  it('skips style tags only when applyLeadingStyle is explicitly false', () => {
    const out = applyAssistantStyleTags('今天天气不错。', {
      styleTags: ['轻快'],
      applyLeadingStyle: false,
    });
    assert.equal(out, '今天天气不错。');
  });

  it('buildMimoTtsBody applies tags for non-first sentences too', () => {
    const body = buildMimoTtsBody(
      '第二句继续讲。',
      { mode: 'default', voice: '冰糖', styleTags: ['沉稳'] },
      { applyLeadingStyle: true, model: 'mimo-v2.5-tts' },
    );
    assert.equal(body.messages[0]!.content, '(沉稳)第二句继续讲。');
  });
});

