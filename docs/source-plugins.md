# Source 插件系统

> **写插件？** 请直接看开发规范： [source-plugin-development.md](./source-plugin-development.md)


## 目标

将「内容获取」从 pipeline 中剥离，使核心只消费统一的 `SourceArtifact`。

高风险获取（Firecrawl / yt-dlp 等）以 **可选外部插件** 形式接入，默认不启用。

## 架构

```text
apps/server/src/sources/
  types.ts        # SourceArtifact / SourcePlugin / Manifest
  registry.ts     # 注册、启停、匹配
  state.ts        # 启用状态持久化（app_settings）
  loader.ts       # 扫描 storage/plugins/source 热加载
  host.ts         # importSource / refreshExternal
  plugins/
    directHttp.ts # 内置低风险插件

storage/plugins/source/<dir>/
  plugin.json
  index.js
```

## 内置 vs 外部

| 类型 | 位置 | 默认 |
|------|------|------|
| builtin `direct-http` | 代码内 | 启用 |
| external | `storage/plugins/source/*` | 跟随清单；high 风险强制默认关 |

## plugin.json

```json
{
  "id": "source.echo",
  "name": "Echo Test Plugin",
  "version": "0.1.0",
  "entry": "index.js",
  "apiVersion": 1,
  "description": "...",
  "riskLevel": "low",
  "capabilities": ["url"],
  "defaultEnabled": false,
  "permissions": ["network"]
}
```

入口 ESM 导出其一：`default` | `plugin` | `createPlugin()`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/source-plugins` | 列表 |
| POST | `/api/source-plugins/rescan` | 热扫描加载 |
| PATCH | `/api/source-plugins/:id` | `{ "enabled": true/false }` |
| POST | `/api/source-plugins/:id/reset` | 清除启停覆盖 |
| PUT | `/api/source-plugins/:id/config` | `{ "config": { "token": "..." } }` 保存参数 |
| POST | `/api/source-plugins/:id/config/reset` | 清空该插件参数 |

需登录（走全局 auth guard）。

## 插件参数（token 等）

插件可在 `plugin.json` / 运行时声明 `configSchema`。后台 **设置 → 内容源** 展开「配置参数」填写。

```json
{
  "configSchema": [
    {
      "key": "token",
      "label": "API Token",
      "type": "password",
      "required": true
    }
  ]
}
```

- 持久化：`app_settings.source_plugin_config`
- 敏感字段（`password` / `secret:true`）列表接口不回说明文，只给 `set/hint`
- 保存时敏感字段空串 = 保留原值；`null` = 删除
- 运行时：`ctx.config` / `ctx.getConfig('token')`
- 必填未齐：`configReady=false`，自动匹配与 `importSource` 会拒绝

## 任务指定插件

创建 URL 任务时可指定插件：

```http
POST /api/jobs/from-url
{ "url": "https://example.com/a.mp4", "pluginId": "direct-http" }
```

- 缺省 `pluginId`：自动匹配（启用 ∩ available ∩ canHandle，低风险优先）
- 指定 `pluginId`：强制使用该插件（须已启用且 canHandle）
- 任务字段：`sourcePluginId`（pipeline 导入时透传）

## 使用

```ts
import { importSource, refreshExternalSourcePlugins } from '../sources/index.js';

await refreshExternalSourcePlugins();

const artifact = await importSource({
  type: 'url',
  url: 'https://example.com/a.mp4',
  jobId,
});
```

## 示例与开发

- 开发规范： [source-plugin-development.md](./source-plugin-development.md)
- 示例插件： `examples/source-plugin-echo/`

## 风险策略

1. 仅本地目录加载，不做远程安装
2. `riskLevel=high` 时 `defaultEnabled` 强制 false
3. 加载失败插件会出现在列表中并带 `loadError`，不可启用
4. 启停状态写入 SQLite `app_settings.source_plugin_enabled`

## 相关

- [ASR / TTS 插件](./asr-tts-plugins.md)（同一套机制）
