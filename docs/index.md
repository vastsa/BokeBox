---
layout: home

hero:
  name: BokeBox
  text: 内容进匣，AI 成播
  tagline: 私人 AI 播客工作室 —— 多源内容转化为可收听节目。人设、音色与风格可自定义，支持 MCP 与插件扩展，本地私有部署。
  image:
    src: /img/logo.webp
    alt: BokeBox
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 做完第一期
      link: /guide/first-episode
    - theme: alt
      text: GitHub
      link: https://github.com/vastsa/BokeBox

features:
  - icon: 🎧
    title: 真的能听完
    details: AI 重写为口播结构，有开场、重点与收尾，不是干巴巴朗读字幕。
  - icon: 🔌
    title: 输入可扩展
    details: 视频 / 链接 / 文稿 / 会议与课程等均可进匣；Source 与 Schedule 插件继续扩展。
  - icon: 🎙️
    title: 人设与音色
    details: 主播是谁、对谁讲、什么风格、用什么声音 —— 全局默认或单集临时改。
  - icon: 🤖
    title: MCP 原生
    details: 内置 MCP，Cursor / Claude 等可创建节目、查询任务，把播客工作流交给 AI。
  - icon: 🧩
    title: 插件生态
    details: Source / ASR / TTS / Schedule 统一 plugin-kit，热扫描加载，示例齐全。
  - icon: 🏠
    title: 私有部署
    details: 单用户本地部署，任务与进度留在你这边。开源协议 LGPL-3.0。
---

## 界面一览

<div class="bokebox-gallery">
  <figure>
    <img src="/img/home_zh.webp" alt="BokeBox 桌面" />
    <figcaption>桌面 · 任务与进度</figcaption>
  </figure>
  <figure>
    <img src="/img/lis_zh.webp" alt="BokeBox 播放" />
    <figcaption>播放器 · 听播体验</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-persona.webp" alt="人设设置" />
    <figcaption>设置 · 人设</figcaption>
  </figure>
  <figure>
    <img src="/img/settings-voice.webp" alt="音色设置" />
    <figcaption>设置 · 音色</figcaption>
  </figure>
</div>

## 文档导航

| 分类 | 页面 |
| --- | --- |
| 入门 | [快速开始](/guide/getting-started) · [做完第一期](/guide/first-episode) · [介绍](/guide/introduction) · [功能](/guide/features) · [FAQ](/guide/faq) |
| 使用 | [流水线](/guide/pipeline) · [定时订阅](/guide/schedule) · [MCP](/guide/mcp) |
| 部署 | [配置](/guide/configuration) · [部署](/guide/deployment) · [架构](/guide/architecture) · [CI/CD](/ops/ci-cd) |
| 插件 | [总览](/plugins/) · [Source](/plugins/source) · [ASR/TTS](/plugins/asr-tts) · [Schedule](/plugins/schedule) |
| 开发 | [总览](/development/) · [Source](/development/source-plugin) · [TTS](/development/tts-plugin) · [Schedule](/development/schedule-plugin) · [Tokens](/development/web-design-tokens) |

## 30 秒看懂

```text
  你丢进去的                    BokeBox 交还给你的
 ─────────────                 ─────────────────
  会议录像 / 纪要               有节奏的口播节目
  课程回放 / 材料    ──AI──▶    可自定义的主播人设
  深度长文 / 文稿               预置 / 描述定制音色
  任意链接（可插件扩展）         封面 · 闪卡 · 听播进度
```

## 仓库

- 源码：<https://github.com/vastsa/BokeBox>
- 协议：LGPL-3.0-only
- Issues：<https://github.com/vastsa/BokeBox/issues>
