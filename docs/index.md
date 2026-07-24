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
    - theme: alt
      text: Product Hunt
      link: https://www.producthunt.com/products/bokebox

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
    <img src="/img/home.webp" alt="BokeBox 桌面" />
    <figcaption>桌面 · 任务与进度</figcaption>
  </figure>
  <figure>
    <img src="/img/player.webp" alt="BokeBox 播放" />
    <figcaption>播放器 · 听播体验</figcaption>
  </figure>
  <figure>
    <img src="/img/flashcard.webp" alt="闪卡" />
    <figcaption>播放 · 闪卡复习</figcaption>
  </figure>
  <figure>
    <img src="/img/starmap.webp" alt="星图" />
    <figcaption>星图 · 知识关联</figcaption>
  </figure>
  <figure>
    <img src="/img/persona.webp" alt="人设设置" />
    <figcaption>设置 · 人设</figcaption>
  </figure>
  <figure>
    <img src="/img/plugins.webp" alt="插件设置" />
    <figcaption>设置 · 插件</figcaption>
  </figure>
  <figure>
    <img src="/img/mcp.webp" alt="MCP 设置" />
    <figcaption>设置 · MCP</figcaption>
  </figure>
  <figure>
    <img src="/img/schedules.webp" alt="订阅设置" />
    <figcaption>设置 · 订阅</figcaption>
  </figure>
</div>

## 文档导航

| 分类 | 页面 |
| --- | --- |
| 入门 | [快速开始](/guide/getting-started) · [做完第一期](/guide/first-episode) · [设置中心](/guide/settings) · [介绍](/guide/introduction) · [功能](/guide/features) · [FAQ](/guide/faq) |
| 使用 | [流水线](/guide/pipeline) · [定时订阅](/guide/schedule) · [MCP](/guide/mcp) |
| 部署 | [配置](/guide/configuration) · [部署](/guide/deployment) · [架构](/guide/architecture) · [CI/CD](/ops/ci-cd) |
| 插件 | [总览](/plugins/) · [Source](/plugins/source) · [ASR/TTS](/plugins/asr-tts) · [Schedule](/plugins/schedule) |
| 开发 | [总览](/development/) · [示例](/development/examples) · [安装](/development/plugin-install) · [Source](/development/source-plugin) · [TTS](/development/tts-plugin) · [Schedule](/development/schedule-plugin) · [Tokens](/development/web-design-tokens) |

## 30 秒看懂

```text
  你丢进去的                    BokeBox 交还给你的
 ─────────────                 ─────────────────
  会议录像 / 纪要               有节奏的口播节目
  课程回放 / 材料    ──AI──▶    可自定义的主播人设
  深度长文 / 文稿               预置 / 描述定制音色
  任意链接（可插件扩展）         封面 · 闪卡 · 听播进度
```

English map: [/en/](/en/)


## 在线地址

<a href="https://www.producthunt.com/products/bokebox?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bokebox" target="_blank" rel="noopener noreferrer"><img alt="BokeBox - Multi-source private podcasts with MCP + plugins | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1205113&theme=light&t=1784859421480" /></a>


- 演示站：<https://bokebox.aiuo.net/>
- Product Hunt：<https://www.producthunt.com/products/bokebox>
- 文档站：<https://bkb-docs.aiuo.net/>
- 源码：<https://github.com/vastsa/BokeBox>

## 仓库

- 源码：<https://github.com/vastsa/BokeBox>
- 协议：LGPL-3.0-only
- Issues：<https://github.com/vastsa/BokeBox/issues>

## 免责声明

本项目按原样提供，**仅供学习、研究与技术交流**。使用与合规责任由部署者/使用者自行承担，详见 [README 免责声明](https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md#-免责声明) 与 [LICENSE](https://github.com/vastsa/BokeBox/blob/main/LICENSE)（LGPL-3.0）。
