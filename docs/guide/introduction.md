# 项目介绍

> **BokeBox · 播匣** —— 内容进匣，AI 成播  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0-only

## 一句话

把视频、网页链接、文章、会议纪要、课程材料或纯文稿丢进匣子，BokeBox 会：

1. 理解内容  
2. 写成口播稿  
3. 用你指定的声音说出来  
4. 变成一档随时可听的私人播客  

不是又一个「某格式转音频」工具，而是一台 **多源输入、只属于你的 AI 播客工作室**。

## 能力一览

| 你在意的 | BokeBox 怎么做 |
| --- | --- |
| **真的能听完** | AI 重写为口播结构：开场、重点、收尾 |
| **输入不设限** | 视频 / 链接 / 文稿 / 会议与课程；Source 插件继续扩展 |
| **听起来像人** | 自然口播音色 + 语气标签（停顿、轻笑、语速……） |
| **人设你说了算** | 主播、听众、风格、节目名 —— 全局或单集 |
| **AI 可调用** | 内置 MCP，Cursor / Claude 等可创建节目、查任务 |
| **知识能留下** | 自动闪卡，关键点可复习 |
| **数据在本地** | 单用户私有部署，任务与进度留在本机 |

## 架构速览

```text
                    ┌─────────────┐
  视频 / 链接 / 文稿 │  Source 插件 │──▶ SourceArtifact
  RSS / 榜单订阅     │ Schedule 插件│──▶ 候选 URL → Job
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │   Pipeline  │  理解 → 口播稿 → 闪卡
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │  TTS 插件   │──▶ 音频
                    │  ASR 插件   │──▶ 转写（可选）
                    └──────┬──────┘
                           ▼
                      可听的私人播客
```

## 仓库结构

```text
apps/
  server/     # API、pipeline、插件宿主、MCP
  web/        # 前端
packages/
  shared/     # 共享类型与工具
docs/         # 本站（VitePress）
examples/     # 各类插件示例
storage/      # 运行时数据与外部插件目录
```

## 文档地图

- 入门：[快速开始](./getting-started.md)
- 插件说明：[Source](../plugins/source.md) · [ASR/TTS](../plugins/asr-tts.md) · [Schedule](../plugins/schedule.md)
- 开发规范：[Source 开发](../development/source-plugin.md) · [TTS 开发](../development/tts-plugin.md) · [Schedule 开发](../development/schedule-plugin.md)
- 运维：[Docker CI/CD](../ops/ci-cd.md)
- 前端 Token：[Design Tokens](../development/web-design-tokens.md)

## 开源与归属

本项目采用 **LGPL-3.0-only** 开源协议。

- 源码：<https://github.com/vastsa/BokeBox>
- Issues：<https://github.com/vastsa/BokeBox/issues>
- License：仓库根目录 `LICENSE`
