# TTS 插件开发规范

> 适用于 BokeBox 外部语音合成插件（`storage/plugins/tts/*`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 宿主 API 版本：`apiVersion = 1`

## 核心原则

**音色页面由插件自己声明，宿主只做通用渲染，不固定业务布局。**

- 插件导出 `meta.voicePanel.fields[]`
- 前端 `TtsPluginVoicePanel` 按字段类型渲染
- 后人写插件 **无需改主仓 UI 代码**
- 只有要新增**字段类型**（组件能力）时，才需要给宿主提 PR

可运行示例：

- 预置网格：[`examples/tts-plugin-echo`](../examples/tts-plugin-echo/)
- 自定义 reference 面板：[`examples/tts-plugin-fishspeech`](../examples/tts-plugin-fishspeech/)

总览：[asr-tts-plugins.md](./asr-tts-plugins.md)

---

## 1. 目录

```text
storage/plugins/tts/<dir>/
  plugin.json
  index.js      # ESM，export default plugin
  README.md
```

```bash
cp -R examples/tts-plugin-echo storage/plugins/tts/echo
curl -X POST http://localhost:8787/api/tts-plugins/rescan
```

---

## 2. 最小可运行插件

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
    description: '示例',
    modes: [{ id: 'default', label: '标准' }],
    voices: [
      { id: 'a', name: '音色 A', language: '中文' },
      { id: 'b', name: '音色 B', language: '中文' },
    ],
    supportsStyleTags: false,
    supportsVoiceDesign: false,
    maxCharsPerRequest: 800,
    voiceConfigKey: 'defaultVoice',

    // ★ 插件自己定义页面
    voicePanel: {
      version: 1,
      title: '选择音色',
      description: '这些文案和字段都由插件控制',
      fields: [
        { type: 'info', text: '请选择一个预置音色' },
        { type: 'voiceGrid' }, // 默认读 meta.voices
        {
          type: 'text',
          bind: 'voice',
          label: '或手动填写音色 ID',
          placeholder: 'optional-override-id',
        },
      ],
    },
  },
  isAvailable() { return true },
  async synthesizeChunk(input, ctx) {
    const voice =
      String(input?.tts?.voice || '').trim() ||
      String(ctx?.getConfig?.('defaultVoice') || '') ||
      'a';
    // 调你的 API...
    return {
      audio: Buffer.from([]),
      format: 'wav',
      provider: 'tts.myprovider',
      voice,
      mode: 'default',
      demo: false,
    };
  },
};
```

---

## 3. voicePanel 字段类型（宿主内置组件）

| type | 作用 | 主要属性 |
|------|------|----------|
| `info` | 提示文案 | `text` |
| `modeTabs` | 模式切换 | `options[]`；默认 `meta.modes` |
| `voiceGrid` | 音色网格 | `options[]`；默认 `meta.voices` |
| `text` / `textarea` | 文本输入 | `bind: 'voice' \| 'voiceDesign'` |
| `select` | 下拉 | `bind` + `options[{value,label}]` |
| `tags` | 多选标签 | `bind: 'styleTags'` + `options: string[]` |
| `effectiveSummary` | 当前生效 / 插件默认 | 读 `voice` + `voiceConfigKey` |
| `actions` | 快捷按钮 | `usePluginDefault` / `clearOverride` / `openPluginSettings` |

### 条件显示

```js
{ type: 'textarea', bind: 'voiceDesign', label: '描述', when: { mode: 'voicedesign' } }
{ type: 'voiceGrid', when: { mode: 'default' } }
```

### 数据绑定（TtsOptions）

| bind | 含义 |
|------|------|
| `voice` | 任务/全局音色 id 或 reference_id |
| `mode` | `default` / `voicedesign`（modeTabs 写入） |
| `voiceDesign` | 自然语言音色描述 |
| `styleTags` | 风格标签数组 |

插件配置默认音色：

- 在 `configSchema` 声明字段（如 `referenceId` / `defaultVoice`）
- `meta.voiceConfigKey` 指向该字段
- `tts.voice` 为空时，合成逻辑应回落 `ctx.getConfig(voiceConfigKey)`

---

## 4. 示例：克隆类（Fish Speech 风格）

```js
meta: {
  voiceConfigKey: 'referenceId',
  voicePanel: {
    version: 1,
    title: '参考音色',
    fields: [
      { type: 'info', text: '粘贴音色库 model id' },
      {
        type: 'text',
        bind: 'voice',
        label: 'reference_id',
        placeholder: '留空=插件默认',
      },
      { type: 'effectiveSummary' },
      {
        type: 'actions',
        items: ['usePluginDefault', 'clearOverride', 'openPluginSettings'],
      },
    ],
  },
}
```

完整实现见 `examples/tts-plugin-fishspeech`。

---

## 5. 兼容：voiceUi 简写（可选）

若未提供 `voicePanel`，宿主会把旧字段编译成面板：

| voiceUi | 编译结果 |
|---------|----------|
| `preset` | voiceGrid（+ 可选 modeTabs/tags） |
| `reference` | text + effectiveSummary + actions |
| `freeform` | text + actions |
| `none` | info |

**新插件请直接写 `voicePanel`，不要依赖简写。**

---

## 6. 自检清单

- [ ] `meta.voicePanel.fields` 非空，页面完全由你定义  
- [ ] `synthesizeChunk` 正确处理任务 `voice` 覆盖与插件默认  
- [ ] 长文本适配 `maxCharsPerRequest`  
- [ ] 返回优先 `format: 'wav'`  
- [ ] README 说明每个字段含义与音色 id 来源  
- [ ] 不把密钥写进仓库  

---

## 7. 何时需要改宿主？

| 需求 | 是否改主仓 |
|------|------------|
| 新布局、新文案、新字段组合 | ❌ 只改插件 `voicePanel` |
| 新的字段类型（如上传参考音频） | ✅ 扩展宿主 field renderer |
| 新的合成协议 | ❌ 插件 `synthesizeChunk` 内完成 |

---

仓库：https://github.com/vastsa/BokeBox  
协议：LGPL-3.0
