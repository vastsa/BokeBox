---
description: BokeBox MCP 端点、Token 与工具列表。
---

# MCP 接入

BokeBox 内置 **MCP（Model Context Protocol）** 端点，方便 Cursor / Claude Desktop / Codex 等直接创建节目、查询任务。

服务启动后会在后台 **自动生成长期 Token**。

## 端点

| 项 | 值 |
| --- | --- |
| 协议端点 | `POST /mcp`（Bearer Token） |
| 安装配置 | 登录后 `GET /api/mcp/install`，或 **设置 → MCP** 一键复制 |
| 协议版本 | `2024-11-05`（与当前实现一致） |

可选环境变量 `PUBLIC_BASE_URL`：经反向代理暴露时，用于生成正确的安装地址。

## Cursor 示例

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

## 可用工具

| 工具 | 说明 |
| --- | --- |
| `create_podcast_from_url` | 从 URL 创建播客任务；可指定 Source 插件、标题、语言、是否上架 |
| `create_podcast_from_text` | 从文稿正文创建任务 |
| `list_jobs` | 列出任务（可按状态过滤、限制条数） |
| `get_job` | 任务详情；可选包含完整口播稿 / 转写 / 笔记 / 闪卡 |
| `update_job` | 更新标题或上架状态 |
| `retry_job` | 重试失败或指定步骤 |
| `delete_job` | 删除任务及媒体 |
| `list_library` | 听播库中已上架节目 |
| `get_system_health` | 系统状态、AI 配置、demo 模式等 |

### 典型流程

```text
create_podcast_from_url / create_podcast_from_text
        │
        ▼
   list_jobs / get_job   ← 轮询进度
        │
        ▼
   list_library          ← 上架后收听
```

## 安全提示

- Token 等同于账号能力入口，**不要提交到公开仓库或截图外传**
- 单用户部署场景下，结合本机防火墙 / 反向代理鉴权限制外网暴露面
- 需要轮换时可在设置页管理（以当前 UI 能力为准）

## 相关

- [功能清单](./features.md)
- [配置与环境变量](./configuration.md)
- [快速开始](./getting-started.md)
- 源码：[`apps/server/src/services/mcp/`](https://github.com/vastsa/BokeBox/tree/main/apps/server/src/services/mcp)
