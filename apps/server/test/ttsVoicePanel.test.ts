import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edgeTtsProvider, resolveEdgeVoice } from '../src/providers/tts/edgeTts.js';
import { mimoTtsProvider } from '../src/providers/tts/mimoTts.js';
import { resolveVoicePanel } from '../src/providers/tts/voicePanel.js';

describe('tts voicePanel regression (edge / mimo)', () => {
  it('mimo panel keeps modeTabs + voiceGrid + tags + voiceDesign + voiceclone fields', () => {
    const panel = resolveVoicePanel(mimoTtsProvider.meta);
    const types = panel.fields.map((f) => f.type);
    assert.ok(types.includes('modeTabs'));
    assert.ok(types.includes('voiceGrid'));
    assert.ok(types.includes('tags'));
    assert.ok(types.includes('textarea'));
    assert.ok(types.includes('text')); // clone path field
    assert.ok(types.includes('info'));
    const modes = mimoTtsProvider.meta.modes || [];
    assert.ok(modes.some((m) => m.id === 'voiceclone'));
    assert.equal(mimoTtsProvider.meta.supportsStyleTags, true);
    assert.equal(mimoTtsProvider.meta.supportsVoiceDesign, true);
    assert.ok((mimoTtsProvider.meta.voices || []).length >= 8);
    assert.equal(mimoTtsProvider.meta.suggestedModels?.defaultVoice, '冰糖');
    assert.equal(mimoTtsProvider.meta.suggestedModels?.tts, 'mimo-v2.5-tts');
  });

  it('edge panel is voiceGrid only (no style/voiceDesign fields)', () => {
    const panel = resolveVoicePanel(edgeTtsProvider.meta);
    const types = panel.fields.map((f) => f.type);
    assert.deepEqual(types, ['voiceGrid']);
    assert.equal(edgeTtsProvider.meta.supportsStyleTags, false);
    assert.equal(edgeTtsProvider.meta.supportsVoiceDesign, false);
    assert.ok((edgeTtsProvider.meta.voices || []).length >= 10);
    assert.equal(
      edgeTtsProvider.meta.suggestedModels?.defaultVoice,
      'zh-CN-XiaoxiaoNeural',
    );
  });

  it('resolveVoicePanel prefers custom voicePanel over voiceUi', () => {
    const custom = resolveVoicePanel({
      id: 'x',
      name: 'X',
      voiceUi: 'preset',
      voices: [{ id: 'a', name: 'A' }],
      voicePanel: {
        version: 1,
        fields: [
          {
            type: 'text',
            bind: 'voice',
            label: 'ref',
          },
        ],
      },
    });
    assert.deepEqual(
      custom.fields.map((f) => f.type),
      ['text'],
    );
  });

  it('resolveEdgeVoice ignores non-edge defaults such as 冰糖', () => {
    assert.equal(resolveEdgeVoice('冰糖'), 'zh-CN-XiaoxiaoNeural');
    assert.equal(resolveEdgeVoice('zh-CN-YunxiNeural'), 'zh-CN-YunxiNeural');
    assert.equal(resolveEdgeVoice(undefined), 'zh-CN-XiaoxiaoNeural');
  });
});
