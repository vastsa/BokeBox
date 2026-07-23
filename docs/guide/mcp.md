---
description: BokeBox MCP 端点、Token 与工具列表。
---

# MCP 接入

BokeBox 内置 **MCP（Model Context Protocol）** 端点，方便 Cursor / Claude Desktop / Codex 等直接创建节目、查询任务与管理订阅。

服务启动后会在后台 **自动生成长期 Token**。

## 端点

| 项 | 值 |
| --- | --- |
| 协议端点 | `POST /mcp`（Bearer Token） |
| 安装配置 | 登录后 `GET /api/mcp/install`，或 **设置 → MCP** 一键复制 |
| 协议版本 | `2024-11-05`（与当前实现一致） |

可选环境变量 `PUBLIC_BASE_URL`：经反向代理暴露时，用于生成正确的安装地址。见 [配置](./configuration.md)。

## 客户端配置

### Cursor

```json
{
  "mcpServers": {
    "bokebox": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer <在设置页复制的 Token>"
      }
    }
  }
}
```

将 `url` 换成你的实际访问根地址 + `/mcp`。

### 其他客户端

设置页通常提供 **Cursor / Claude Desktop / Codex** 等安装片段，以界面复制结果为准。

## 工具列表

### 任务与听播

| 工具 | 说明 |
| --- | --- |
| `create_podcast_from_url` | 从 URL 创建任务；可指定 Source 插件、标题、语言、是否上架 |
| `create_podcast_from_text` | 从文稿正文创建任务 |
| `list_jobs` | 列出任务（可按状态过滤、限制条数） |
| `get_job` | 任务详情；可选包含完整口播稿 / 转写 / 笔记 / 闪卡 |
| `update_job` | 更新标题或上架状态 |
| `retry_job` | 重试失败或指定步骤 |
| `delete_job` | 删除任务及媒体 |
| `list_library` | 听播库中已上架节目 |
| `get_system_health` | 系统状态、AI 配置、demo 模式等 |

### 定时订阅

| 工具 | 说明 |
| --- | --- |
| `list_schedules` | 列出订阅 |
| `get_schedule` | 单条订阅详情 |
| `create_schedule` | 创建订阅（插件 + 参数 + 节奏） |
| `run_schedule_now` | 立即执行一轮 |
| `list_schedule_plugins` | 可用 Schedule 插件 |

订阅产品说明见 [定时订阅](./schedule.md)。

## 典型流程

```text
# 做一期
create_podcast_from_url / create_podcast_from_text
        │
        ▼
   list_jobs / get_job     ← 轮询进度
        │
        ▼
   list_library            ← 上架后收听

# 订一个源
list_schedule_plugins → create_schedule → run_schedule_now
        │
        ▼
   list_jobs               ← 自动进匣的任务
```

## 安全提示

- Token 等同于账号能力入口，**不要提交到公开仓库或截图外传**
- 单用户部署场景下，结合本机防火墙 / 反向代理限制外网暴露面
- 需要轮换时在 **设置 → MCP** 按界面能力处理

## 相关

- [做完第一期节目](./first-episode.md)
- [定时订阅](./schedule.md)
- [配置与环境变量](./configuration.md)
- 源码：[`apps/server/src/services/mcp/`](https://github.com/vastsa/BokeBox/tree/main/apps/server/src/services/mcp)
