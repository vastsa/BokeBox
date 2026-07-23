# ASR 插件开发规范

> 适用于 BokeBox 外部语音转写插件（`storage/plugins/asr/*`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 宿主 API 版本：`apiVersion = 1`

本文面向插件作者。产品总览见 [ASR / TTS 插件](../plugins/asr-tts.md)，可运行示例见 [examples/asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo)。

TTS 请写：[TTS 插件开发](./tts-plugin.md)。

---

## 1. 设计原则

1. **插件只做「音频 → 文本」**  
   不要改 Job、不要写 SQLite、不要调度 pipeline。宿主负责：  
   - 在合适阶段调用 `transcribe`  
   - 把结果写入任务转写产物  
   - 继续口播稿 / TTS 等后续步骤  

2. **输入是本地文件路径**  
   `input.audioPath` 指向宿主已准备好的音频文件（抽取或规范化后）。  
   插件应读取该路径，**不要**假设 URL 直传（除非你自行下载到临时文件）。

3. **严格激活，不静默串台**  
   运行时使用设置中的 `asrProvider`。用户选中某插件时，应以该插件为准；  
   配置缺失应 `throw` 明确错误，避免静默返回空串或假成功。

4. **默认关闭、最小权限**  
   外部插件建议 `defaultEnabled: false`。  
   `riskLevel: high` 时宿主会强制默认关。  
   需要出站时声明 `permissions: ["network"]` 等。

5. **可热插拔**  
   放入 `storage/plugins/asr/<dir>/` 或 zip 上传后，设置页「重新扫描」或  
   `POST /api/asr-plugins/rescan` 即可。

---

## 2. 目录与安装

```text
storage/plugins/asr/<plugin-dir>/
  plugin.json     # 必填
  index.js        # 必填：ESM（或 plugin.json 的 entry）
  README.md       # 推荐
  node_modules/   # 可选
```

```bash
mkdir -p storage/plugins/asr
cp -R examples/asr-plugin-echo storage/plugins/asr/echo

# 热加载
curl -s -X POST http://localhost:8787/api/asr-plugins/rescan

# 启用
curl -s -X PATCH http://localhost:8787/api/asr-plugins/asr.echo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

设置页路径：**设置 → 插件 → 语音转写**。  
「设为当前」会把 `asrProvider` 写成该插件 id（也可在 **AI 服务** 里选）。

> `storage/plugins/**` 默认不入库。

---

## 3. plugin.json

### 3.1 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 全局唯一，建议 `asr.<name>`，仅 `[a-zA-Z0-9._-]` |
| `name` | string | 是 | 展示名 |
| `version` | string | 是 | 如 `0.1.0` |
| `entry` | string | 是 | 相对目录的 ESM 入口，禁止 `..` / 绝对路径 |
| `apiVersion` | number | 是 | 当前必须为 `1` |
| `description` | string | 否 | 设置页说明 |
| `riskLevel` | `low` \| `medium` \| `high` | 否 | 默认按清单规范化；`high` 强制默认关 |
| `defaultEnabled` | boolean | 否 | 建议 `false` |
| `permissions` | string[] | 否 | 如 `config`、`network` |
| `suggestedModel` | string | 否 | 建议模型 id，设置页可展示 |
| `configSchema` | array | 否 | 设置表单项（见下） |
| `kind` | string | 否 | 可写 `asr`（可选） |

### 3.2 示例

```json
{
  "id": "asr.echo",
  "name": "Echo ASR",
  "version": "0.1.0",
  "entry": "index.js",
  "apiVersion": 1,
  "description": "演示 ASR：返回固定转写文本",
  "riskLevel": "low",
  "defaultEnabled": false,
  "permissions": ["config"],
  "suggestedModel": "echo",
  "configSchema": [
    {
      "key": "prefix",
      "label": "文稿前缀",
      "type": "string",
      "required": false,
      "default": "EchoASR"
    }
  ]
}
```

### 3.3 configSchema 常用类型

与 Source/TTS 相同（plugin-kit）：

- `string` / `password` / `number` / `boolean`  
- `select`（options）  
- 字段：`key`、`label`、`type`、`required`、`default`、`description`、`placeholder`

密钥用 `password`，不要写进日志。

---

## 4. 入口导出（契约）

ESM `export default` 一个对象，**加载器会校验**：

| 成员 | 要求 |
| --- | --- |
| `id` | 与清单一致（可省略，由清单注入） |
| `name` | 非空字符串 |
| `version` | 非空字符串 |
| `riskLevel` | `low` \| `medium` \| `high` |
| `defaultEnabled` | boolean |
| `isAvailable()` | 函数，返回是否可调用 |
| `transcribe(input, ctx)` | async 函数 |
| `description` | 推荐 |
| `suggestedModel` | 可选 |
| `strictAvailability` | 可选；为 true 时选中不可用也不静默换源 |
| `configSchema` | 可选；也可只写在 plugin.json |

### 4.1 最小可运行插件

```js
// index.js
import fs from 'node:fs/promises';

export default {
  id: 'asr.myprovider',
  name: 'My ASR',
  version: '0.1.0',
  description: '示例转写',
  riskLevel: 'medium',
  defaultEnabled: false,
  suggestedModel: 'my-model',

  isAvailable() {
    // 例如检查 apiKey 是否已配置：运行时更准的是在 transcribe 里读 ctx
    return true;
  },

  /**
   * @param {{ audioPath: string, format?: string, model?: string, language?: string }} input
   * @param {{ storageDir: string, config: object, getConfig: (k: string) => unknown, signal?: AbortSignal }} ctx
   */
  async transcribe(input, ctx) {
    const audioPath = String(input?.audioPath || '');
    if (!audioPath) throw new Error('缺少 audioPath');

    // 确认文件可读（可选）
    await fs.access(audioPath);

    const apiKey = String(ctx?.getConfig?.('apiKey') || '').trim();
    if (!apiKey) throw new Error('请先在插件配置中填写 apiKey');

    const model =
      String(input?.model || '').trim() ||
      String(ctx?.getConfig?.('model') || '') ||
      'my-model';

    // 调用你的 ASR API：上传 audioPath 对应文件 …
    // 注意响应 AbortSignal：ctx.signal
    const text = '……转写结果……';

    return {
      text,
      provider: 'asr.myprovider',
      model,
      demo: false,
    };
  },
};
```

清单与代码可同时声明 `configSchema`；以加载结果为准（通常清单 + 导出合并，以宿主实现为准——导出对象上的 schema 也会注册）。

### 4.2 输入 `AsrTranscribeInput`

| 字段 | 说明 |
| --- | --- |
| `audioPath` | **必填**，本地绝对/工作路径，宿主侧音频文件 |
| `format` | 可选，如 `mp3`、`wav`、`m4a` |
| `model` | 可选，覆盖插件默认模型 |
| `language` | 可选，语言提示（如 `zh`、`en`） |

### 4.3 输出 `AsrTranscribeResult`

| 字段 | 说明 |
| --- | --- |
| `text` | **必填**，转写正文 |
| `provider` | 提供方 id，通常等于插件 `id` |
| `model` | 实际使用的模型名 |
| `demo` | 可选，演示数据时标 `true` |

### 4.4 上下文 `AsrPluginContext`

| 字段 | 说明 |
| --- | --- |
| `storageDir` | 应用存储根 |
| `config` | 当前插件配置表 |
| `getConfig(key)` | 读单项配置 |
| `signal` | 可选 `AbortSignal`，任务取消时中止请求 |

---

## 5. 内置提供方（参考，非外部插件）

宿主代码注册的内置 ASR（理解行为即可）：

| 典型 id | 说明 |
| --- | --- |
| 云端 MiMo / OpenAI 兼容 | Chat 或 `/audio/transcriptions` |
| 本地 Whisper | 本机二进制，无云密钥 |
| demo | 固定文稿回落（默认不启用） |

外部插件 id **不要**与内置冲突。

---

## 6. 管理 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/asr-plugins` | 列表（含 active、available） |
| POST | `/api/asr-plugins/rescan` | 热扫描 |
| PATCH | `/api/asr-plugins/:id` | `{ "enabled": true/false }` |
| POST | `/api/asr-plugins/:id/reset` | 恢复 defaultEnabled |
| PUT | `/api/asr-plugins/:id/config` | `{ "config": { ... } }` |
| POST | `/api/asr-plugins/:id/config/reset` | 清空配置 |

安装 zip：设置页插件中心（与 Source/TTS 相同机制）。

激活：

- 设置 → 插件 →「设为当前」  
- 或设置 → AI 服务 → `asrProvider` = 插件 id  

---

## 7. 联调检查单

1. `plugin.json` 的 `id` / `apiVersion` / `entry` 正确  
2. `export default` 含 `isAvailable` + `transcribe`  
3. rescan 后出现在列表，无 `loadError`  
4. 启用并设为当前 `asrProvider`  
5. 丢一条含音频/视频的任务，确认转写阶段走到你的插件  
6. 故意清空密钥，确认错误信息可读（而非空白失败）  
7. 长音频：若你的 API 有时长限制，在插件内自行分段并拼接 `text`  

---

## 8. 常见错误

| 现象 | 排查 |
| --- | --- |
| rescan 后没有 | `plugin.json` 损坏、entry 路径错、非 ESM |
| loadError | 缺 `transcribe` / `riskLevel` / `defaultEnabled` |
| 仍用旧提供方 | 未改 `asrProvider` 或未启用插件 |
| text 为空 | 检查 API 响应映射；空结果会导致后续口播失败 |
| 文件找不到 | 使用 `input.audioPath`，勿写死相对路径 |

---

## 9. 与 TTS / Source 的关系

```text
Source/导入 → 音频文件
      → ASR.transcribe  → 转写文本
      → 口播脚本
      → TTS.synthesize  → 节目音频
```

- Source：拿内容  
- **ASR：听成字**  
- TTS：字成声  

安装与启停通用说明：[插件安装与管理](./plugin-install.md) · [示例目录](./examples.md)

---

## 10. 协议与归属

- 仓库：https://github.com/vastsa/BokeBox  
- 协议：LGPL-3.0-only  
- 分发插件时请保留宿主项目归属说明  
