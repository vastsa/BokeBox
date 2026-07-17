# Source 插件抽象（Phase 1）

## 目标

将「内容获取」从 pipeline 中剥离，使核心只消费统一的 `SourceArtifact`。

后续 Firecrawl / yt-dlp 等高风险能力以 **可选插件** 形式接入，默认不启用。

## 目录

```text
apps/server/src/sources/
  types.ts                 # SourceArtifact / SourcePlugin
  registry.ts              # 注册、启用、匹配
  host.ts                  # importSource 统一入口
  index.ts
  plugins/
    directHttp.ts          # 内置：公开 HTTP 直链 + 简易网页提取
```

## 使用

```ts
import { importSource, registerSourcePlugin } from '../sources/index.js';

const artifact = await importSource({
  type: 'url',
  url: 'https://example.com/a.mp4',
  jobId,
});
// artifact.localPath / kind / textContent ...
```

## 热插拔

- `registerSourcePlugin(plugin)` / `unregisterSourcePlugin(id)`
- `setSourcePluginEnabled(id, false)` 运行时禁用
- 匹配规则：显式 `pluginId` > 已启用且 `canHandle` 且风险从低到高

## 风险策略

| 插件 | riskLevel | defaultEnabled |
|------|-----------|----------------|
| direct-http | low | true |
| firecrawl（规划） | medium | false |
| yt-dlp（规划） | high | false |

## 兼容

- `services/urlImporter.ts` 仍提供实现细节与工具函数
- pipeline 已改为走 `importSource`，不再直接调用 `importUrlContent`
