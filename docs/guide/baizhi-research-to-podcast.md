---
description: 核实百智 MCP 返回的研究材料，整理为文本，再用 BokeBox 制作私人播客。
---

# 用百智研究材料制作私人播客

想把已经查过的资料整理成一集通勤节目，可以在已有的 [百智云 Agent Toolkit](https://baizhi.cloud/landing/agent-toolkit) MCP 连接中检索主题，自行核实和选取材料，再把整理好的文稿导入 BokeBox。

这条流程由你完成资料审核和文本交接。适合已有百智 MCP 连接，并已按 [快速开始](./getting-started.md) 配好 BokeBox 的用户。

## 1. 检索并核实材料

在你已有的 AI 客户端中使用百智 MCP 连接检索主题。查看实际返回的内容和可用来源，打开原始来源核实其是否支持相关说法，并检查日期和适用范围。

把已核实、你有权使用的部分整理成连贯文稿。对于不能确认的说法，先从文稿中移除或明确标注不确定性；把来源链接和核实日期保留在自己的资料记录中，方便回查。

## 2. 保存为文本

将选好的文稿保存为 **UTF-8 编码的 `.txt` 文件**，例如 `baizhi-research-notes.txt`。正文至少 20 个字符，最好包含清晰的主题、要点和上下文。

文件里只放准备制作成节目的内容。API Key、MCP Token 和客户端配置应留在各自的配置位置。

## 3. 导入 BokeBox

先按 [做完第一期节目](./first-episode.md) 检查 **设置 → AI 服务**，确认口播和语音模型，以及人设、音色等制作设置。百智查询和 BokeBox 配置的模型服务各自适用其条款与计费。

**选择或拖入文件就会上传并创建制作任务**，因此请先完成文稿审核和设置，再打开新建节目的 **本地文件** 入口，选择该 `.txt` 文件。

BokeBox 将文本作为文稿处理，跳过 ASR，进入口播稿、语音等制作流程。完成后查看任务详情，试听并核对生成的节目；模型改写后的内容仍需你检查。

如果上传提示正文过短，请补充文稿；如果后续制作失败，按任务错误信息和 [常见问题](./faq.md) 检查配置。

## 相关

- [百智云 Agent Toolkit](https://baizhi.cloud/landing/agent-toolkit)
- [BokeBox 项目](https://github.com/vastsa/BokeBox) · [LGPL-3.0-only 许可证](https://github.com/vastsa/BokeBox/blob/main/LICENSE)
- [做完第一期节目](./first-episode.md)

本指南作为百智云 Agent Toolkit 的社区接入与推广内容贡献，按 BokeBox 的 LGPL-3.0-only 协议提供。
