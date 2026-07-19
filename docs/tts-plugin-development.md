# TTS 插件开发规范

> 适用于 BokeBox 外部语音合成插件（`storage/plugins/tts/*`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 宿主 API 版本：`apiVersion = 1`

本文面向**第三方插件作者**。系统总览见 [asr-tts-plugins.md](./asr-tts-plugins.md)。

可运行示例：

- 预置音色：[`examples/tts-plugin-echo`](../examples/tts-plugin-echo/)
- reference_id：[`examples/tts-plugin-fishspeech`](../examples/tts-plugin-fishspeech/)

---

## 1. 设计原则

1. **宿主不特判你的插件 id**  
   UI / 默认音色 / 能力开关全部由你导出的 `meta` 声明。新增插件**不需要改主仓前端**。

2. **能力声明驱动界面**  
   音色面板长什么样，看 `meta.voiceUi`；有没有风格标签 / VoiceDesign，看 `supports*`。

3. **任务覆盖 + 插件默认**  
   - 用户在设置/制作页填写的 `tts.voice` = **任务级覆盖**  
   - 插件配置里的默认音色字段 = **插件默认**  
   - `tts.voice` 为空时，应回落到插件默认

4. **可热插拔**  
   放入 `storage/plugins/tts/<dir>/` 后 rescan 即可，无需改主程序。

---

## 2. 目录约定

```text
storage/plugins/tts/<plugin-dir>/
  plugin.json     # 必填：清单 + configSchema
  index.js        # 必填：ESM 入口
  README.md       # 推荐：安装、音色说明
```

```bash
mkdir -p storage/plugins/tts
cp -R examples/tts-plugin-echo storage/plugins/tts/echo
curl -X POST http://localhost:8787/api/tts-plugins/rescan
```

> `storage/plugins/**` 默认 gitignore，插件由用户本机安装。

---

## 3. plugin.json

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一，建议 `tts.<name>` |
| `name` / `version` / `entry` | 是 | 展示名、版本、入口 |
| `apiVersion` | 是 | 当前必须为 `1` |
| `riskLevel` | 否 | `low` / `medium` / `high`，默认按清单 |
| `defaultEnabled` | 否 | 建议 `false`；`high` 时宿主强制 false |
| `permissions` | 否 | 常用 `network` `config` |
| `configSchema` | 否 | 设置页参数表单（API Key、默认音色等） |

音色 UI **不写在 plugin.json**，写在入口导出的 `meta`（见下）。

---

## 4. 入口导出（核心契约）

```js
export default {
  id: 'tts.myprovider',
  name: 'My TTS',
  version: '0.1.0',
  riskLevel: 'medium',
  defaultEnabled: false,

  meta: {
    id: 'tts.myprovider',
    name: 'My TTS',
    description: '一句话说明',
    modes: [{ id: 'default', label: '标准合成' }],

    // ★ 必填建议：决定音色面板长什么样
    voiceUi: 'preset', // preset | reference | freeform | none

    // 当 voiceUi=preset 时展示这些音色
    voices: [
      { id: 'alloy', name: 'Alloy', language: '多语' },
    ],

    // 插件配置里「默认音色」字段名（可选）
    // reference 常用 referenceId；也可 defaultVoice
    voiceConfigKey: 'defaultVoice',

    supportsStyleTags: false,     // 是否显示风格标签（目前仅 MiMo 级体验）
    supportsVoiceDesign: false,   // 是否显示 VoiceDesign 模式
    maxCharsPerRequest: 800,      // 宿主按此切段
    suggestedModels: {
      tts: 'my-model',
      defaultVoice: 'alloy',
    },
  },

  isAvailable() {
    // 可做轻量判断；详细校验可在 synthesizeChunk 抛错
    return true;
  },

  /**
   * @param {{ text: string, tts?: { voice?: string, mode?: string }, applyLeadingStyle?: boolean }} input
   * @param {{ getConfig: (key: string) => unknown, config: Record<string, unknown>, signal?: AbortSignal }} ctx
   */
  async synthesizeChunk(input, ctx) {
    const text = String(input?.text || '').trim();
    // 任务覆盖优先，否则插件默认
    const voice =
      String(input?.tts?.voice || '').trim() ||
      String(ctx?.getConfig?.('defaultVoice') ?? '') ||
      'alloy';

    // ... 调你的 API，返回 Buffer
    return {
      audio: Buffer.from(/* wav bytes */),
      format: 'wav', // 推荐 wav，便于多段拼接
      provider: 'tts.myprovider',
      model: 'my-model',
      voice,
      mode: 'default',
      demo: false,
    };
  },
};
```

---

## 5. 音色面板怎么选（voiceUi）

| `voiceUi` | 宿主展示 | 你该怎么做 | 示例 |
|-----------|----------|------------|------|
| **`preset`** | 音色网格 | 填 `meta.voices[]`；`tts.voice` 为选中 id | OpenAI 风格、自有固定音色表 |
| **`reference`** | reference_id 输入 + 插件默认 | 配置项提供默认 ref；`tts.voice` 覆盖 | Fish Speech / 克隆类 |
| **`freeform`** | 单行文本框 | 任意字符串音色 id | 仅文档说明、无列表 |
| **`none`** | 不展示选音色 | 忽略 voice | 纯占位/固定音 |

### 5.1 preset 示例要点

```js
meta: {
  voiceUi: 'preset',
  voices: [
    { id: 'v1', name: '沉稳男声', language: '中文', gender: '男性' },
    { id: 'v2', name: '清亮女声', language: '中文', gender: '女性' },
  ],
  suggestedModels: { defaultVoice: 'v1' },
}
```

`synthesizeChunk` 内：

```js
const voice = input.tts?.voice || ctx.getConfig('defaultVoice') || 'v1';
```

### 5.2 reference 示例要点（克隆 / 音色库）

```js
// plugin.json configSchema 建议包含：
// { key: 'referenceId', label: '默认音色 ID', type: 'string' }

meta: {
  voiceUi: 'reference',
  voiceConfigKey: 'referenceId', // 宿主「插件默认」读这个字段
  voices: [],                    // 可不填列表
  supportsStyleTags: false,
  supportsVoiceDesign: false,
}
```

解析顺序（推荐）：

```js
function resolveVoice(input, ctx) {
  const override = String(input?.tts?.voice || '').trim();
  if (override) return override; // 用户在制作页粘贴的 ref
  return String(ctx.getConfig('referenceId') || '').trim() || undefined;
}
```

宿主 UI 会显示：

- 当前生效 ref  
- 插件默认 `referenceId`  
- 「填入插件默认 / 清除覆盖」

### 5.3 freeform

无固定列表、又不想叫 reference 时用：

```js
meta: { voiceUi: 'freeform', voiceConfigKey: 'defaultVoice', voices: [] }
```

---

## 6. 配置字段约定（configSchema）

| 场景 | 建议 key | 类型 |
|------|----------|------|
| 云端 endpoint | `baseUrl` | string |
| 密钥 | `apiKey` | password |
| 默认模型 | `model` | string / select |
| 默认音色（preset/freeform） | `defaultVoice` | string |
| 默认 reference（克隆） | `referenceId` | string |
| 超时 | `timeoutMs` | number |

`meta.voiceConfigKey` 指向你真正用来存默认音色的 key。  
未声明时，宿主会按顺序尝试：`referenceId` → `reference_id` → `defaultVoice` → `voice`。

---

## 7. 宿主会读哪些 meta？

| 字段 | 用途 |
|------|------|
| `voiceUi` | 音色面板形态 |
| `voiceConfigKey` | 插件默认音色配置 key |
| `voices` | preset 网格 |
| `supportsStyleTags` | 风格标签区 |
| `supportsVoiceDesign` | VoiceDesign 模式 |
| `maxCharsPerRequest` | 长文切段 |
| `suggestedModels.defaultVoice` | preset 默认选中项 |
| `modes` | 模式说明（可选展示） |

列表 API：`GET /api/tts-plugins` 会把上述字段返回给前端。

---

## 8. 音频返回建议

- 优先 **`format: 'wav'`**（PCM），宿主多段拼接最稳  
- 也支持 `mp3` / `ogg`（拼接能力弱于 wav）  
- `provider` 填你的插件 id  
- 失败请 `throw new Error('可读中文原因')`

---

## 9. 自检清单（发插件前）

- [ ] `id` 以 `tts.` 开头且全局唯一  
- [ ] `apiVersion: 1`  
- [ ] **显式声明 `meta.voiceUi`**（不要指望宿主猜）  
- [ ] `preset` 时 `voices` 非空；`reference` 时有 `voiceConfigKey` + configSchema  
- [ ] `synthesizeChunk` 正确处理「任务 voice 覆盖 / 插件默认」  
- [ ] 长文本可被 `maxCharsPerRequest` 合理切段  
- [ ] README 写清安装、配置、音色 id 从哪来  
- [ ] 不把 API Key 写进仓库  

---

## 10. 常见问题

**Q: 我新写了插件，设置页音色还是显示冰糖？**  
A: 多半没声明 `voiceUi`，且未提供 `voices`，前端会兜底 freeform；若仍像 MiMo，确认 `ttsProvider` 是否已切到你的插件 id，并 rescan。

**Q: 必须改 BokeBox 前端吗？**  
A: 不需要。声明 `meta` 即可。只有当你需要**全新面板形态**（第四种以上交互）时，才要给宿主提 PR 扩展 `voiceUi` 枚举。

**Q: 能动态拉远程音色列表吗？**  
A: 当前契约是静态 `meta.voices`。若要动态列表，可先用 `reference`/`freeform` 让用户粘贴 id；动态列表可作为后续宿主能力扩展（插件导出 `listVoices()` 之类）。

---

## 11. 相关链接

- 总览：[asr-tts-plugins.md](./asr-tts-plugins.md)  
- Source 插件规范：[source-plugin-development.md](./source-plugin-development.md)  
- 示例：`examples/tts-plugin-echo` · `examples/tts-plugin-fishspeech`  
- 仓库：https://github.com/vastsa/BokeBox  
