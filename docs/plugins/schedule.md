# Schedule 订阅插件

> 与 Source/ASR/TTS 共用 `plugin-kit`（namespace=`schedule`）。  
> **写插件？** → [Schedule 插件开发](../development/schedule-plugin.md)

## 目标

把「候选内容从哪来」从调度器里拔出：

- 核心：cron + 去重 + 建任务  
- 插件：RSS、榜单、第三方 API、用户自定义源

## 架构

```text
apps/server/src/services/schedule/plugins/
  types.ts      # 契约
  registry.ts   # 注册 / 启停
  loader.ts     # 扫描 storage/plugins/schedule
  host.ts       # 内置 rss/url-list + fetchScheduleCandidates
  config/state  # plugin-kit 持久化

storage/plugins/schedule/<dir>/
  plugin.json
  index.js
```

## 内置插件

| id | 说明 | 默认 |
|----|------|------|
| `schedule.rss` | RSS/Atom | 启用 |
| `schedule.url-list` | 固定 URL 列表 | 启用 |

## 统一模型（设置 → 订阅）

每条订阅只选 **插件 + 参数 + 节奏**，不再区分「是不是插件」：

```json
{
  "kind": "plugin",
  "sourceConfig": {
    "pluginId": "schedule.rss",
    "params": { "feedUrl": "https://example.com/feed.xml" },
    "feedUrl": "https://example.com/feed.xml"
  }
}
```

- URL 列表：`pluginId=schedule.url-list`，`params.urls=[...]`
- 自定义插件：同上，params 由插件解释
- 历史 `kind=rss|url_list` 仍可执行，保存时会归一到 plugin

外部示例：

- `examples/schedule-plugin-echo`
- `examples/schedule-plugin-github-trending`

## 快速安装 GitHub Trending

```bash
mkdir -p storage/plugins/schedule
cp -R examples/schedule-plugin-github-trending \
  storage/plugins/schedule/github-trending
```

设置 → 插件 → 订阅 → 重新扫描 → 启用 → 订阅里选该插件 → 每天 08:00。
