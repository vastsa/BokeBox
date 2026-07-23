---
description: BokeBox 任务制作流水线各阶段说明。
---

# 制作流水线

每个节目对应一个 **Job**。流水线在服务端异步执行，Web 与 MCP 共享同一套逻辑。

## 阶段一览

```text
1. 获取 / 导入     Source 插件或内置导入 → SourceArtifact
2. 提取音频        视频抽音 / 音频规范化（纯文本可跳过）
3. ASR 转写        语音 → 文本（纯文本可跳过）
4. 口播脚本        转写/原文 → 结构化口播稿 + 笔记
5. 封面            可选 AI 图（无图像模型时降级）
6. 知识闪卡        从内容抽可复习卡片
7. TTS 合成        口播稿 → 音频
8. 上架            进入听播库（可配置默认行为）
```

进度文案与百分比由服务端按阶段更新，首页任务卡片会展示。

## 输入形态差异

| 来源 | 提取 | ASR | 写稿 |
| --- | --- | --- | --- |
| 视频 | ✅ | ✅ | 基于转写 |
| 音频 | 规范化 | ✅ | 基于转写 |
| 文稿 / 纯文本 | 可静音占位 | 跳过 | 基于正文 |
| URL | 视 Source 插件产物 kind | 视 kind | 同上 |

## 重跑与跳过

支持从指定步骤重跑，例如只重做「口播」或「合成」：

- 已有合格产物时，后续重跑可 **复用** 上游结果  
- 适合改人设后重写稿、换音色后只重 TTS  

MCP：`retry_job`（可带步骤相关参数，以工具 schema 为准）。

## 失败与重试

- 任务详情与列表展示错误信息  
- 网络 / 提供方 5xx 类问题可直接重试  
- 配置错误（Key、模型 ID）需先改 [配置](./configuration.md) 再跑  

## 与订阅的关系

[定时订阅](./schedule.md) 只负责 **产出候选 URL 并创建 Job**，之后仍走本流水线，不另起炉灶。

## 相关代码（开发者）

- Pipeline：[`apps/server/src/services/job/pipeline.ts`](https://github.com/vastsa/BokeBox/tree/main/apps/server/src/services/job)
- 媒体：`services/media/`（提取 / ASR / TTS / 封面）
- 内容：`services/content/`（口播 / 闪卡 / 提示词）

## 相关文档

- [做完第一期节目](./first-episode.md)
- [功能清单](./features.md)
- [架构概览](./architecture.md)
