---
description: BokeBox 架构与 monorepo、插件宿主、数据流。
---

# 架构概览

## 一句话

多源内容经 **Source / Schedule** 进入统一素材形态，再走 **Job Pipeline**（ASR → 口播稿 → 封面/闪卡 → TTS），最终进入听播库；**MCP** 与 Web UI 共享同一套服务能力。

## 总体数据流

```text
  视频 / 链接 / 文稿          RSS / 榜单 / 自定义
           │                        │
           ▼                        ▼
    ┌──────────────┐         ┌──────────────┐
    │ Source 插件  │         │ Schedule 插件│
    │ + 内置导入   │         │ cron + 去重  │
    └──────┬───────┘         └──────┬───────┘
           │   SourceArtifact       │ 候选 URL
           └───────────┬────────────┘
                       ▼
              ┌────────────────┐
              │  Job Pipeline  │
              │ 提取 → ASR →   │
              │ 口播 → 封面/   │
              │ 闪卡 → TTS     │
              └────────┬───────┘
                       ▼
              ┌────────────────┐
              │ 听播库 / 播放器│
              │ 专辑 · 进度    │
              └────────────────┘

  Web UI  ──HTTP/API──▶  apps/server
  MCP 客户端 ──/mcp──▶  apps/server
```

## Monorepo 布局

```text
apps/
  server/     API、pipeline、插件宿主、MCP、SQLite
  web/        React 前端
packages/
  shared/     共享类型与工具
docs/         VitePress 文档站（本站）
examples/     Source / ASR / TTS / Schedule 插件示例
storage/      运行时数据与外部插件目录（默认不入库媒体）
```

## Server 子域（`apps/server/src/services`）

| 子域 | 职责 |
| --- | --- |
| `settings/` | 全局设置（KV / 站点 / 账号 / AI / 提示词） |
| `import/` | URL 与本地素材导入 |
| `job/` | 任务存储、流水线、听播进度、脚本时间轴 |
| `media/` | 音视频提取、ASR、TTS、封面与图片优化 |
| `content/` | 口播稿、闪卡、提示词模板 |
| `album/` | 专辑 |
| `auth/` | 登录 / 初始化 / 改密 |
| `mcp/` | MCP 协议、Token、工具 |
| `schedule/` | 定时订阅与订阅插件 |
| `plugins/` | 插件管理相关服务 |

约定：跨子域引用对方路径，避免扁平大杂烩。

## 插件宿主

Source / ASR / TTS / Schedule 共用 **plugin-kit** 基础设施（启停、配置、清单加载），业务接口按能力区分。

```text
storage/plugins/
  source/<dir>/plugin.json + 入口 ESM
  asr/...
  tts/...
  schedule/...
```

- 内置插件：代码注册
- 外部插件：目录扫描 / zip 上传，设置页 rescan 热加载

详见：

- [Source](../plugins/source.md) · [ASR/TTS](../plugins/asr-tts.md) · [Schedule](../plugins/schedule.md)
- 开发：[Source](../development/source-plugin.md) · [TTS](../development/tts-plugin.md) · [Schedule](../development/schedule-plugin.md)

## 前端

- `apps/web`：Vite + React
- 字号 / 颜色 Token 规范：[Design Tokens](../development/web-design-tokens.md)

## 相关

- [项目介绍](./introduction.md)
- [功能清单](./features.md)
- [MCP 接入](./mcp.md)
- [部署](./deployment.md)
