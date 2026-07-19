/**
 * BokeBox TTS 插件示例
 * 安装：
 *   cp -R examples/tts-plugin-echo storage/plugins/tts/echo-tts
 *   curl -X POST http://localhost:8787/api/tts-plugins/rescan
 */
function silentWav(durationSec = 0.3, sampleRate = 16000) {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // samples already zero
  return buf;
}

const plugin = {
  id: 'tts.echo',
  name: 'Echo TTS',
  description: '演示 TTS：返回极短静音',
  version: '0.1.0',
  riskLevel: 'low',
  defaultEnabled: false,
  meta: {
    id: 'tts.echo',
    name: 'Echo TTS',
    description: '演示 TTS：返回极短静音 WAV',
    modes: [{ id: 'default', label: '演示', description: '静音占位' }],
    voices: [{ id: 'echo', name: 'Echo', language: 'demo', description: '占位音色' }],
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    // 插件自定义面板（也可用 voiceUi 简写让宿主生成）
    voicePanel: {
      version: 1,
      fields: [
        {
          type: 'voiceGrid',
          options: [{ id: 'echo', name: 'Echo', language: 'demo' }],
        },
        { type: 'info', text: 'Echo 演示插件：合成极短静音 WAV。' },
      ],
    },
    voiceUi: 'preset',
    maxCharsPerRequest: 5000,
    suggestedModels: { tts: 'echo', defaultVoice: 'echo' },
  },
  isAvailable() {
    return true;
  },
  async synthesizeChunk(input, ctx) {
    const note = String(ctx?.getConfig?.('note') ?? ctx?.config?.note ?? 'echo');
    void note;
    void input;
    return {
      audio: silentWav(0.25),
      format: 'wav',
      provider: 'tts.echo',
      model: 'echo',
      voice: 'echo',
      mode: 'default',
      demo: false,
    };
  },
};

export default plugin;
