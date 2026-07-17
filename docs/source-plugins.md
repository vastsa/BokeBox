# Source 插件系统

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

需登录（走全局 auth guard）。

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

## 示例

见 `examples/source-plugin-echo/`。

## 风险策略

1. 仅本地目录加载，不做远程安装
2. `riskLevel=high` 时 `defaultEnabled` 强制 false
3. 加载失败插件会出现在列表中并带 `loadError`，不可启用
4. 启停状态写入 SQLite `app_settings.source_plugin_enabled`
