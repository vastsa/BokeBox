---
description: BokeBox 定时订阅：RSS、榜单与 Schedule 插件。
---

# 定时订阅

在 **设置 → 订阅** 按节奏自动拉取内容并创建播客任务。

## 统一模型

每条订阅 = **插件 + 参数 + 节奏（cron）**，可选时区。

```json
{
  "pluginId": "schedule.rss",
  "params": { "url": "https://example.com/feed.xml" },
  "cron": "0 8 * * *",
  "timezone": "Asia/Shanghai"
}
```

（字段名以当前 API / 设置为准，示意结构。）

## 内置能力

| 能力 | 说明 |
| --- | --- |
| RSS / Atom | 订阅博客、新闻、播客 feed |
| URL 列表 | 固定一组链接轮询 |
| GitHub Trending | 趋势仓库等内容源（内置插件） |
| Hacker News | HN 热门等（内置插件） |

外部插件目录：`storage/plugins/schedule/`，支持 zip 上传。  
开发规范：[Schedule 插件开发](../development/schedule-plugin.md) · 说明：[Schedule 插件](../plugins/schedule.md)

## 调度行为

- **去重**：已见条目不重复建任务（`schedule_seen_items`）  
- **限流**：每轮 `maxItemsPerRun` 上限  
- **立即执行 / 强制执行**：调试或补跑  
- **运行记录**：回看每轮结果；失败条目可下轮重试  
- **并行**：多条订阅可在同一 tick 内并行（以当前版本实现为准）

插件 **只产出候选 URL**，不直接写 Job 媒体；创建任务后走 [制作流水线](./pipeline.md)。

## MCP

| 工具 | 说明 |
| --- | --- |
| `list_schedules` | 列出订阅 |
| `get_schedule` | 订阅详情 |
| `create_schedule` | 创建订阅 |
| `run_schedule_now` | 立即跑一轮 |
| `list_schedule_plugins` | 可用订阅插件 |

完整 MCP 说明见 [MCP 接入](./mcp.md)。

## 相关

- [插件体系](../plugins/)
- [功能清单](./features.md)
- [做完第一期节目](./first-episode.md)
