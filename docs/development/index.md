---
description: BokeBox 插件开发入口与示例索引。
---

# 插件开发

面向要扩展 BokeBox 的作者。仓库协议 **LGPL-3.0**，请保留归属与协议信息。

先扫一眼：

- [示例插件目录](./examples.md) — 仓库 `examples/` 一览  
- [插件安装与管理](./plugin-install.md) — 复制 / zip / rescan / 启停  

## 选哪条路径

| 你想做的事 | 文档 | 示例 |
| --- | --- | --- |
| 新的内容源（网页、平台、私有 API） | [Source 插件开发](./source-plugin.md) | [source-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo) |
| 新的 ASR / 转写提供方 | [ASR 插件开发](./asr-plugin.md) | [asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo) |
| 新的 TTS / 音色提供方 | [TTS 插件开发](./tts-plugin.md) | [tts-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo) · [tts-plugin-fishspeech](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech) |
| 定时从榜单 / RSS / API 拉候选 | [Schedule 插件开发](./schedule-plugin.md) | [schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo) · [github-trending](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending) |
| 改 Web 视觉 Token | [Design Tokens](./web-design-tokens.md) | `apps/web/src/styles/index.css` |

## 通用约定

- 目录：`storage/plugins/<kind>/<dir>/plugin.json` + ESM 入口  
- 宿主 API 版本：见各开发文档中的 `apiVersion`  
- 出站网络优先 `ctx.safeFetch`（若文档要求）  
- 不要在插件里直接写 SQLite / 自建 cron（Schedule 只产出候选）

## 架构背景

- [架构概览](../guide/architecture.md)
- [插件体系说明](../plugins/)

## 文档本身

- [贡献文档](./contributing-docs.md) — 目录约定与写作说明
