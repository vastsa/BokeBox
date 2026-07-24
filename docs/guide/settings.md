---
description: BokeBox 设置中心各分区说明。
---

# 设置中心

登录后打开 **设置**，可集中管理制作默认值、插件、MCP 与站点。

## 分区一览

| 分区 | 你在这里做什么 |
| --- | --- |
| **音色** | 新建任务默认 TTS；预置音色 / Voice Design |
| **人设** | 默认主播、听众、节目气质 |
| **提示词** | 封面 / 口播 / 改写 / 闪卡模板与变量 |
| **AI 服务** | API 凭证、Base URL、各模型 ID |
| **插件** | Source / ASR / TTS / Schedule 扫描、启停、配置、上传 |
| **订阅** | 订阅插件与参数、节奏、Source 采集插件、立即/强制执行、运行记录（可跳转任务） |
| **MCP** | Token、客户端安装配置、工具说明入口 |
| **站点** | 站点名、SEO、访客访问等 |
| **账户** | 界面语言、外观主题（跟随系统 / 亮 / 暗）、密码、开源信息 |

部分项也可通过 [环境变量](./configuration.md) 在部署期注入（尤其是 AI 与 `PUBLIC_BASE_URL`）。

## 推荐配置顺序

```text
1. AI 服务      → 先保证模型通
2. 音色 / 人设  → 定听感与人格
3. 做一期节目   → 验证流水线
4. 插件 / 订阅  → 扩展输入
5. MCP          → 交给 Cursor 等
6. 站点 / 账户  → 对外暴露前再调
```

## 与文档的对应

- 第一期实操：[做完第一期节目](./first-episode.md)
- 流水线：[制作流水线](./pipeline.md)
- 订阅：[定时订阅](./schedule.md)

### 订阅分区要点

- 发现用 **Schedule 插件**，采集用 **Source 插件**（默认同自动匹配）。
- 插件参数可留空；只保存你填写的覆盖项。
- 运行记录可查看错误并打开本轮 Job。
- 完整说明见 [定时订阅](./schedule.md)。
- MCP：[MCP 接入](./mcp.md)
- 插件安装：[插件安装与管理](../development/plugin-install.md)

## 界面参考

<div class="bokebox-gallery">
  <figure>
    <img src="/img/settings-voice.webp" alt="音色" />
    <figcaption>音色</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-persona.webp" alt="人设" />
    <figcaption>人设</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-prompts.webp" alt="提示词" />
    <figcaption>提示词</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-mcp.webp" alt="MCP" />
    <figcaption>MCP</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-site.webp" alt="站点" />
    <figcaption>站点</figcaption>
  </figure>
</div>
