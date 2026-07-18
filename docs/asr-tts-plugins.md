# ASR / TTS 插件

ASR 与 TTS 已与 **Source 插件** 使用同一套机制：

- 目录约定：`storage/plugins/{asr|tts}/<dir>/plugin.json` + 入口 ESM
- 启停 / 配置 / rescan 热加载
- 内置插件代码注册；外部插件本地扫描
- 管理 API 与设置页 UI

## 目录

```text
storage/plugins/
  source/   # 内容源
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

## 激活哪个插件

- 设置 → **AI 服务** 中的 `asrProvider` / `ttsProvider` 选择**激活**插件 id
- 设置 → **内容源** 页下方可管理 ASR / TTS 插件启停与参数
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
    voices: [],
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    maxCharsPerRequest: 2000,
  },
  isAvailable() { return true },
  async synthesizeChunk(input, ctx) {
    return { audio: Buffer.from(...), format: 'wav', provider: 'tts.xxx' }
  },
}
```

## 示例

```bash
cp -R examples/asr-plugin-echo storage/plugins/asr/echo-asr
cp -R examples/tts-plugin-echo storage/plugins/tts/echo-tts
curl -X POST http://localhost:8787/api/asr-plugins/rescan
curl -X POST http://localhost:8787/api/tts-plugins/rescan
```

仓库地址：https://github.com/vastsa/BokeBox  
协议：LGPL-3.0
