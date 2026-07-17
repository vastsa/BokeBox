# Source 插件开发规范

> 适用于 BokeBox 外部内容源插件（`storage/plugins/source/*`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 宿主 API 版本：`apiVersion = 1`

本文面向插件作者。系统总览见 [source-plugins.md](./source-plugins.md)，可运行示例见 [examples/source-plugin-echo](../examples/source-plugin-echo/)。

---

## 1. 设计原则

1. **核心不碰高风险抓取**  
   主程序只消费统一的 `SourceArtifact`。平台专用、绕过、登录态抓取等能力必须做成外部插件。

2. **插件默认关闭**  
   尤其是 `riskLevel: "high"` 时，宿主会强制 `defaultEnabled = false`，需用户在设置页手动启用。

3. **最小权限**  
   只声明真实需要的 `permissions`；不要默认读取 cookie 或拉起任意子进程。

4. **合规由使用者负责**  
   插件不得诱导未授权批量采集。文档与文案应提示：仅处理有权使用的内容。

5. **可热插拔**  
   插件放进目录后，设置页「重新扫描」或 `POST /api/source-plugins/rescan` 即可加载，无需改主仓代码。

---

## 2. 目录约定

```text
storage/plugins/source/<plugin-dir>/
  plugin.json     # 必填：清单
  index.js        # 必填：ESM 入口（或 plugin.json 指定的 entry）
  README.md       # 推荐：安装与合规说明
  node_modules/   # 可选：插件自带依赖
```

安装示例：

```bash
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo
```

然后在 **设置 → 内容源** 点击「重新扫描」，再打开开关。

> 注意：`storage/plugins/**` 默认不入库，插件由用户本机放置。

---

## 3. plugin.json 清单

### 3.1 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 全局唯一，建议 `source.<name>`，仅 `[a-zA-Z0-9._-]` |
| `name` | string | 是 | 展示名称 |
| `version` | string | 是 | 语义化版本，如 `0.1.0` |
| `entry` | string | 是 | 相对插件目录的 ESM 入口，禁止 `..` 与绝对路径 |
| `apiVersion` | number | 是 | 当前必须为 `1` |
| `description` | string | 否 | 设置页说明 |
| `riskLevel` | `"low" \| "medium" \| "high"` | 否 | 默认 `high` |
| `capabilities` | string[] | 否 | `url` / `file` / `webpage` / `media` |
| `defaultEnabled` | boolean | 否 | 默认 `false`；`high` 时宿主强制 false |
| `permissions` | string[] | 否 | 见权限表 |

### 3.2 示例

```json
{
  "id": "source.echo",
  "name": "Echo Test Plugin",
  "version": "0.1.0",
  "entry": "index.js",
  "apiVersion": 1,
  "description": "演示插件：将 echo: 正文写为本地文本，不发起网络请求",
  "riskLevel": "low",
  "capabilities": ["url"],
  "defaultEnabled": false,
  "permissions": []
}
```

### 3.3 风险等级建议

| 等级 | 典型能力 | 默认 |
|------|----------|------|
| `low` | 本地变换、演示、公开直链辅助 | 可 false |
| `medium` | 通用网页提取（如 Firecrawl，用户自备 Key） | 建议 false |
| `high` | yt-dlp、平台私有接口、cookie/登录态 | 必须 false |

---

## 4. 入口导出

入口文件必须是 **ESM**，导出以下之一：

```js
// 推荐
export default plugin;

// 或
export const plugin = { ... };

// 或工厂
export function createPlugin() {
  return plugin;
}
```

宿主加载时会用 `?t=timestamp` 做缓存破坏，以支持热重载。

---

## 5. 插件接口（apiVersion = 1）

### 5.1 SourcePlugin

```ts
interface SourcePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: 'low' | 'medium' | 'high';
  capabilities: Array<'url' | 'file' | 'webpage' | 'media'>;
  defaultEnabled: boolean;

  /** 依赖/配置是否就绪 */
  isAvailable(): boolean;

  /** 快速匹配，避免重 IO */
  canHandle(input: SourceInput): boolean;

  /** 可选：轻量探测，不落盘 */
  probe?(input: SourceInput, ctx: SourcePluginContext): Promise<SourceProbe>;

  /** 拉取并规范化产出 */
  fetch(input: SourceInput, ctx: SourcePluginContext): Promise<SourceArtifact>;
}
```

运行时对象的 `id` 必须与 `plugin.json` 的 `id` 一致（不一致会加载失败）。

### 5.2 SourceInput

```ts
type SourceInput =
  | { type: 'url'; url: string; jobId: string; pluginId?: string }
  | {
      type: 'file';
      filePath: string;
      jobId: string;
      filename?: string;
      mimeType?: string;
      pluginId?: string;
    };
```

当前流水线主路径是 **URL**。`file` 预留给后续扩展。

### 5.3 SourcePluginContext

```ts
interface SourcePluginContext {
  jobId: string;
  jobDir: string;      // storage/jobs/{jobId}
  storageDir: string;  // storage/
  signal?: AbortSignal;
}
```

**落盘请使用 `ctx.jobDir`**，不要猜测 `process.cwd()`。

### 5.4 SourceArtifact（统一产出）

```ts
interface SourceArtifact {
  kind: 'video' | 'audio' | 'text';
  localPath: string;     // 必填：本地文件绝对路径
  mimeType: string;
  size: number;
  filename: string;
  textContent?: string;  // kind=text 时强烈建议提供
  title?: string;
  sourceUrl?: string;
  pluginId: string;      // 填自己的 id
  strategy?: string;
  rawMeta?: Record<string, unknown>;
}
```

| kind | pipeline 行为概要 |
|------|-------------------|
| `video` / `audio` | 抽音频 → ASR → 口播稿 → TTS |
| `text` | 跳过 ASR，直接进入脚本生成 |

---

## 6. 匹配与调度规则

宿主按以下顺序选择插件：

1. 输入显式带 `pluginId` 且该插件已启用  
2. 否则在 **已启用 + isAvailable + canHandle** 的插件中，按 `riskLevel` **从低到高** 选第一个  

创建任务时指定插件：

```http
POST /api/jobs/from-url
{ "url": "https://example.com/a", "pluginId": "direct-http" }
```

前端「URL 导入」面板可选插件；缺省为自动匹配。任务会持久化 `sourcePluginId`，流水线导入时透传给 `importSource`。

因此：

- `canHandle` 应尽量精确（例如只匹配你的 URL 前缀/域名）  
- 不要 `canHandle` 对所有 URL 返回 true，以免抢占 `direct-http`  
- 高风险插件即使启用，也会在同分场景下更晚被选中  

---

## 7.1 插件参数（configSchema）

需要 API Token / Base URL 等后台可填项时，在 `plugin.json` 声明：

```json
"configSchema": [
  {
    "key": "token",
    "label": "API Token",
    "type": "password",
    "required": true,
    "description": "服务商签发的密钥"
  },
  {
    "key": "baseUrl",
    "label": "API 地址",
    "type": "string",
    "required": false,
    "default": "https://api.example.com"
  }
]
```

支持类型：`string` | `password` | `number` | `boolean` | `select`。

在 `fetch` 中读取：

```js
async fetch(input, ctx) {
  const token = ctx.getConfig('token');
  if (!token) throw new Error('请先在设置中填写 API Token');
  // ...
}
```

注意：

- 不要在插件代码里硬编码密钥
- `password` 字段后台不会回显明文
- 必填项未配置时宿主会认为 `configReady=false`，导入会失败

## 7. 权限声明

| permission | 含义 | 建议 |
|------------|------|------|
| `network` | 访问外网 | Firecrawl / 下载 |
| `fs:job-dir` | 写入当前任务目录 | 几乎所有插件 |
| `process:spawn` | 启动子进程 | yt-dlp / ffmpeg 封装 |
| `config` | 读取用户配置（API Key 等） | 需 Key 的服务 |
| `cookies` | 读取登录态 | 默认不要；高风险 |

> 当前版本：权限主要用于清单声明与 UI 展示；后续宿主可能做强制校验。请按真实能力填写。

---

## 8. 最小实现模板

```js
// index.js
import fs from 'node:fs/promises';
import path from 'node:path';

const plugin = {
  id: 'source.echo',
  name: 'Echo Test Plugin',
  description: '演示插件：echo: 正文 → 本地文本',
  version: '0.1.0',
  riskLevel: 'low',
  capabilities: ['url'],
  defaultEnabled: false,

  isAvailable() {
    return true;
  },

  canHandle(input) {
    return (
      input?.type === 'url' &&
      typeof input.url === 'string' &&
      input.url.startsWith('echo:')
    );
  },

  async fetch(input, ctx) {
    if (!this.canHandle(input)) {
      throw new Error('仅支持 echo: 前缀');
    }

    const body = input.url.slice('echo:'.length) || '(empty)';
    const text = `# Echo\n\n${body}\n`;
    const localPath = path.join(ctx.jobDir, 'source.echo.txt');

    await fs.mkdir(ctx.jobDir, { recursive: true });
    await fs.writeFile(localPath, text, 'utf8');

    return {
      kind: 'text',
      localPath,
      mimeType: 'text/plain',
      size: Buffer.byteLength(text, 'utf8'),
      filename: 'echo.txt',
      textContent: text,
      title: body.slice(0, 40) || 'echo',
      sourceUrl: input.url,
      pluginId: 'source.echo',
      strategy: 'echo',
    };
  },
};

export default plugin;
```

---

## 9. 开发检查清单

发布或提交插件前请确认：

- [ ] `plugin.json` 与入口 `id` 一致  
- [ ] `apiVersion` 为 `1`  
- [ ] `entry` 为相对路径且文件存在  
- [ ] `canHandle` 范围收敛，不误伤其他源  
- [ ] `fetch` 写入 `ctx.jobDir`，返回完整 `SourceArtifact`  
- [ ] `kind=text` 时提供可用的 `textContent`（建议 ≥ 20 字，过短任务会失败）  
- [ ] `riskLevel` / `defaultEnabled` / `permissions` 与真实行为一致  
- [ ] 高风险能力默认关闭，文档有合规说明  
- [ ] 不在插件内硬编码密钥；Key 由用户配置  
- [ ] 失败时抛出可读错误信息（会出现在任务/日志中）  

---

## 10. 调试

### 10.1 设置页

**设置 → 内容源**

- 查看是否加载、是否可用  
- 启停开关  
- 加载失败时的错误信息  

### 10.2 HTTP API（需登录）

```bash
# 列表
curl -s http://localhost:8787/api/source-plugins

# 热加载
curl -s -X POST http://localhost:8787/api/source-plugins/rescan

# 启用
curl -s -X PATCH http://localhost:8787/api/source-plugins/source.echo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'

# 恢复默认启停
curl -s -X POST http://localhost:8787/api/source-plugins/source.echo/reset
```

### 10.3 常见错误

| 现象 | 可能原因 |
|------|----------|
| 列表无插件 | 未放到 `storage/plugins/source/<dir>/` 或未 rescan |
| `loadError` | plugin.json 非法、entry 不存在、导出不符合接口 |
| 有插件但不匹配 URL | `canHandle` 过严，或插件未启用 |
| 文本任务失败 | `textContent` 过短 / 未写盘 |
| 路径错乱 | 未使用 `ctx.jobDir` |

---

## 11. 不要做的事

1. 在主仓默认捆绑高风险抓取库  
2. 提供远程任意代码安装（当前只允许本地目录）  
3. 静默启用 high 风险插件  
4. 教用户绕过会员墙 / DRM / 地区限制  
5. 把他人作品全文库当作默认产品能力宣传  

---

## 12. 与主程序协作方式

```text
用户提交 URL
    ↓
Source 宿主 importSource()
    ↓
已启用插件 canHandle 匹配
    ↓
plugin.fetch() → SourceArtifact
    ↓
pipeline（转写 / 口播 / TTS …）
```

插件作者只负责 **输入 → SourceArtifact**。  
口播、音色、闪卡、封面由核心流水线处理，无需在插件内实现。

---

## 13. 版本兼容

| apiVersion | 状态 |
|------------|------|
| `1` | 当前稳定 |

升级规则：

- 破坏性变更会提升 `apiVersion`  
- 旧插件在不支持的版本下会加载失败并显示原因  
- 尽量保持 `SourceArtifact` 字段向后兼容  

---

## 14. 参考

- 架构说明：[docs/source-plugins.md](./source-plugins.md)  
- 类型定义：`apps/server/src/sources/types.ts`  
- 加载器：`apps/server/src/sources/loader.ts`  
- 示例插件：`examples/source-plugin-echo/`  
- 项目主页：<https://github.com/vastsa/BokeBox>  
- 许可证：`LICENSE`（LGPL-3.0）

---

如需贡献官方示例插件或改进宿主 API，请走 GitHub Issue / PR：  
<https://github.com/vastsa/BokeBox/issues>
