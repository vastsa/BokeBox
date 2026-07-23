---
description: Source / ASR / TTS / Schedule 插件体系总览。
---

# 插件体系

BokeBox 把可替换能力拆成四类插件，共用 **plugin-kit**（启停、配置、清单加载），业务接口按能力区分。

## 四类插件

| 类型 | 作用 | 目录 | 文档 |
| --- | --- | --- | --- |
| **Source** | 内容获取 → 统一 `SourceArtifact` | `storage/plugins/source/` | [说明](./source.md) · [开发](../development/source-plugin.md) |
| **ASR** | 语音转写 | `storage/plugins/asr/` | [说明](./asr-tts.md) |
| **TTS** | 语音合成 | `storage/plugins/tts/` | [说明](./asr-tts.md) · [开发](../development/tts-plugin.md) |
| **Schedule** | 定时订阅候选 URL | `storage/plugins/schedule/` | [说明](./schedule.md) · [开发](../development/schedule-plugin.md) |

## 设计原则

1. **核心只消费统一契约** — 高风险抓取、第三方榜单等以可选外部插件接入  
2. **默认最小权限** — `riskLevel: high` 时强制默认关闭  
3. **热插拔** — 放入目录或 zip 上传后，设置页「重新扫描」即可  
4. **示例可跑** — 仓库 `examples/*-plugin-*`

## 管理入口

- Web：**设置 → 插件**
- API：各类 `/api/{source|asr|tts|schedule}-plugins`（列表 / rescan / 启停 / 配置 / 安装）

## 下一步

- 先读对应「说明」理解架构  
- 再读「开发」写自己的插件  
- 从 `examples/` 复制一份改起最快
