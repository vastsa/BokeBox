# ASR / TTS 插件

ASR / TTS / Source 共用 **plugin-kit** 基础设施（启停、配置、清单加载工具），业务接口按能力区分：

- 目录约定：`storage/plugins/{asr|tts}/<dir>/plugin.json` + 入口 ESM
- 启停 / 配置 / rescan 热加载
- 内置插件代码注册；外部插件本地扫描
- 管理 API 与设置页 UI

## 目录

```text
storage/plugins/
  source/   # 内容获取
  asr/      # 语音转写
  tts/      # 语音合成
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/asr-plugins` | 列表 |
| POST | `/api/asr-plugins/rescan` | 热扫描 |
| PATCH | `/api/asr-plugins/:id` | `{ "enabled": true/false }` |
| POST | `/api/asr-plugins/:id/reset` | 恢复 defaultEnabled |
| PUT | `/api/asr-plugins/:id/config` | 保存参数 |
| POST | `/api/asr-plugins/:id/config/reset` | 清空参数 |

TTS 将前缀换成 `/api/tts-plugins`。

## 激活哪个插件（严格）

> 运行时 **只使用** 设置中的 `asrProvider` / `ttsProvider`。
> 未启用 / 不可用时会直接报错，**不会**静默切换到其他提供方。

- 设置 → **AI 服务** 中的 `asrProvider` / `ttsProvider` 选择**激活**插件 id
- 设置 → **插件** 页切换「语音转写 / 语音合成」管理启停与参数；「设为当前」可写入 asrProvider / ttsProvider
- 未启用或不可用时，会回落其它已启用可用插件，最后是 `demo`

## 外部插件清单

`plugin.json` 字段与 Source 一致（`id/name/version/entry/apiVersion/...`）。

### ASR 导出

```js
export default {
  id: 'asr.xxx',
  name: '...',
  version: '0.1.0',
  riskLevel: 'low',
  defaultEnabled: false,
  isAvailable() { return true },
  async transcribe(input, ctx) {
    // input.audioPath / format / model
    // ctx.getConfig('key')
    return { text: '...', provider: 'asr.xxx' }
  },
}
```

### TTS 导出

```js
export default {
  id: 'tts.xxx',
  name: '...',
  version: '0.1.0',
  riskLevel: 'low',
  defaultEnabled: false,
  meta: {
    id: 'tts.xxx',
    name: '...',
    description: '...',
    modes: [{ id: 'default', label: '默认' }],
    // ★ 第三方插件请显式声明，宿主按此切换音色面板（无需改主仓）
    voiceUi: 'preset', // preset | reference | freeform | none
    voiceConfigKey: 'defaultVoice', // 插件配置中的默认音色字段
    voices: [{ id: 'v1', name: '音色 A' }], // voiceUi=preset 时使用
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    maxCharsPerRequest: 2000,
    suggestedModels: { tts: 'xxx', defaultVoice: 'v1' },
  },
  isAvailable() { return true },
  async synthesizeChunk(input, ctx) {
    // input.tts?.voice = 任务覆盖；否则读 ctx.getConfig(voiceConfigKey)
    return { audio: Buffer.from(...), format: 'wav', provider: 'tts.xxx' }
  },
}
```

第三方完整开发规范见 **[tts-plugin-development.md](./tts-plugin-development.md)**。

## 示例

```bash
# 演示插件
cp -R examples/asr-plugin-echo storage/plugins/asr/echo-asr
cp -R examples/tts-plugin-echo storage/plugins/tts/echo-tts

# Fish Speech / Fish Audio TTS
cp -R examples/tts-plugin-fishspeech storage/plugins/tts/fishspeech

curl -X POST http://localhost:8787/api/asr-plugins/rescan
curl -X POST http://localhost:8787/api/tts-plugins/rescan
```

### 音色 UI（voiceUi）——给第三方作者

**后人写插件不需要改 BokeBox 前端。** 只要在 `meta` 里声明能力，宿主自动切换面板。

| voiceUi | 展示 | 你要提供什么 |
|---------|------|----------------|
| `preset` | 预置音色网格 | `meta.voices[]` |
| `reference` | reference_id 输入 + 插件默认 | `voiceConfigKey` + configSchema（如 `referenceId`） |
| `freeform` | 自由文本音色 id | 可选 `voiceConfigKey` |
| `none` | 无需选音色 | — |

配套字段：

- `voiceConfigKey`：插件配置里默认音色字段名  
- `supportsStyleTags` / `supportsVoiceDesign`：高级面板开关  
- 任务级 `tts.voice` **始终可覆盖**插件默认  

完整说明与自检清单：[`docs/tts-plugin-development.md`](./tts-plugin-development.md)

### Fish Speech（tts.fishspeech）

接入 [Fish Audio](https://fish.audio/) 云端或自托管 [Fish Speech](https://github.com/fishaudio/fish-speech)：

1. 复制插件到 `storage/plugins/tts/fishspeech`
2. 扫描后填写 `baseUrl` / `apiKey` / `referenceId`
3. 启用插件，并将 `ttsProvider` 设为 `tts.fishspeech`

详见 [`examples/tts-plugin-fishspeech/README.md`](../examples/tts-plugin-fishspeech/README.md)。

仓库地址：https://github.com/vastsa/BokeBox  
协议：LGPL-3.0
