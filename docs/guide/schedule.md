---
description: BokeBox 定时订阅：RSS、榜单、Schedule 插件、运行记录与 Source 采集。
---

# 定时订阅

在 **设置 → 订阅** 按节奏自动发现内容，并创建播客任务进入 [制作流水线](./pipeline.md)。

## 两层分工（重要）

订阅不是「一个插件包办一切」，而是两层：

| 层级 | 插件类型 | 职责 |
| --- | --- | --- |
| **发现** | Schedule 订阅插件 | 产出候选条目（`key` / `url` / `title`…） |
| **采集** | Source 内容插件 | 按 URL 下载/解析正文或媒体，再走 ASR → 文稿 → TTS |

- 订阅插件 **只产出链接**，不自己写 Job 媒体文件。  
- 内容采集默认 **自动匹配** 已启用的 Source 插件（常见为内置 `direct-http`）。  
- 也可在订阅表单里 **固定某个 Source 插件**（`jobDefaults.sourcePluginId`）。  
- 不要把 `schedule.*` 当成 Source 插件 id。

```text
订阅 due
  → Schedule 插件 fetch 候选 URL
  → 去重 / 限流 / 写运行记录
  → createJob(sourceUrl)
  → pipeline → Source 插件采集 → 成片
```

## 统一模型

每条订阅 ≈：

```text
订阅插件 (pluginId)
+ 可选参数 (params，仅覆盖项)
+ 节奏 (preset / cron + timezone)
+ 任务默认值 (专辑、标题前缀、Source 插件…)
+ 限流 (maxItemsPerRun、onlyNew)
```

示意（字段以当前 API / 设置为准）：

```json
{
  "name": "我的博客",
  "kind": "plugin",
  "sourceConfig": {
    "pluginId": "schedule.rss",
    "params": { "feedUrl": "https://example.com/feed.xml" }
  },
  "preset": "daily",
  "cron": "0 8 * * *",
  "timezone": "Asia/Shanghai",
  "jobDefaults": {
    "albumId": null,
    "titlePrefix": "早报 · ",
    "sourcePluginId": null,
    "published": true
  },
  "limits": {
    "maxItemsPerRun": 3,
    "onlyNew": true
  }
}
```

### 参数怎么写

- 插件声明了 `configSchema` 时，设置页会 **动态渲染** 表单。  
- **没有要覆盖的参数时不必填**：空字段 / 空对象 **不会写入** `params`。  
- 留空的项在运行时走 **插件中心** 的全局配置（`ctx.getConfig`）。  
- 无 schema 的自定义插件可用可选 JSON；同样可留空。

## 内置订阅插件

| pluginId | 说明 | 典型 params（均可选覆盖） |
| --- | --- | --- |
| `schedule.rss` | RSS / Atom | `{ "feedUrl": "https://…" }`（必填） |
| `schedule.url-list` | 固定 URL 列表 | `{ "urls": ["https://…"] }`（必填） |
| `schedule.github-trending` | GitHub Trending | `since` / `language` / `spokenLanguage` |
| `schedule.hacker-news` | Hacker News | `feed`: top / new / best / ask / show / job |

外部插件目录：`storage/plugins/schedule/`，支持 zip 上传。  
开发：[Schedule 插件开发](../development/schedule-plugin.md) · 说明：[Schedule 插件](../plugins/schedule.md)

## 节奏

| preset | 含义（默认时区 `Asia/Shanghai`） |
| --- | --- |
| `hourly` | 每小时 |
| `every_6h` | 每 6 小时 |
| `daily` | 每天 08:00 |
| `weekly` | 每周一 08:00 |
| `cron` | 自定义 5 段 cron：`分 时 日 月 周` |

## 设置页能做什么

1. 选择 **订阅插件** 与参数（动态表单）  
2. 配置节奏 / 时区、落入专辑、标题前缀、每轮条数、是否仅新条目  
3. 可选：**内容获取插件**（Source，默认自动匹配）  
4. **立即执行** / **强制执行**（忽略去重，补跑）  
5. **运行记录**：展开最近多轮；点开单轮可看  
   - 状态、耗时、抓取 / 新建 / 跳过  
   - 完整错误列表  
   - 本轮创建的 Job id（可跳转任务详情）  
6. 启用 / 停用 / 编辑 / 删除  

## 调度与可靠性

- 进程内调度器约 **30s** 扫描一次 due 订阅；同 tick 有限并行。  
- **单实例** 部署足够；多副本需自行加分布式锁（当前未内置）。  
- 启动时预占 `next_run`，避免长任务被重复捞起。  
- 进程异常中断后，启动会回收 stuck 的 `running` 记录。  
- 去重表：`schedule_seen_items`（仅 **成功建 Job** 后记 seen，失败可下轮重试）。  
- 运行账本：`schedule_runs`（保留策略约每订阅最近数十条）。  
- 插件停用时会推进 `next_run`，避免空转刷日志。

## MCP

| 工具 | 说明 |
| --- | --- |
| `list_schedules` | 列出订阅 |
| `get_schedule` | 详情 + 最近 runs |
| `create_schedule` | 创建（`pluginId` + 可选 `params` / `sourcePluginId` + 节奏） |
| `run_schedule_now` | 立即跑一轮（`force` 跳过去重） |
| `list_schedule_plugins` | 可用订阅插件 |

### create_schedule 示例

RSS：

```json
{
  "name": "我的博客",
  "pluginId": "schedule.rss",
  "feedUrl": "https://example.com/feed.xml",
  "preset": "daily",
  "timezone": "Asia/Shanghai",
  "maxItemsPerRun": 3,
  "onlyNew": true
}
```

HN + 固定 Source 插件：

```json
{
  "name": "HN Top",
  "pluginId": "schedule.hacker-news",
  "params": { "feed": "top" },
  "preset": "every_6h",
  "sourcePluginId": "source.direct-http",
  "maxItemsPerRun": 2
}
```

无额外 params 时不要传空对象；省略即可。

## 相关文档

- [制作流水线](./pipeline.md)  
- [设置中心](./settings.md)  
- [MCP 接入](./mcp.md)  
- [Schedule 插件](../plugins/schedule.md)  
- [Source 插件](../plugins/source.md)  
