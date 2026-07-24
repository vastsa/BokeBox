---
description: BokeBox 产品定位：多源内容转化为私人 AI 播客。
---

# 项目介绍

> **BokeBox · 播匣** —— 内容进匣，AI 成播  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0-only  
> Product Hunt：<https://www.producthunt.com/products/bokebox>

<a href="https://www.producthunt.com/products/bokebox?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bokebox" target="_blank" rel="noopener noreferrer"><img alt="BokeBox - Multi-source private podcasts with MCP + plugins | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1205113&theme=light&t=1784859421480" /></a>

## 一句话

把视频、网页链接、文章、会议纪要、课程材料或纯文稿丢进匣子，BokeBox 会：

1. 理解内容  
2. 写成口播稿  
3. 用你指定的声音说出来  
4. 变成一档随时可听的私人播客  

不是又一个「某格式转音频」工具，而是一台 **多源输入、只属于你的 AI 播客工作室**。

## 30 秒看懂

```text
  你丢进去的                    BokeBox 交还给你的
 ─────────────                 ─────────────────
  会议录像 / 纪要               有节奏的口播节目
  课程回放 / 材料    ──AI──▶    可自定义的主播人设
  深度长文 / 文稿               预置 / 描述定制音色
  任意链接（可插件扩展）         封面 · 闪卡 · 听播进度
```

## 能力一览

| 你在意的 | BokeBox 怎么做 |
| --- | --- |
| **真的能听完** | AI 重写为口播结构：开场、重点、收尾 |
| **输入不设限** | 视频 / 链接 / 文稿 / 会议与课程；插件继续扩展 |
| **听起来像人** | 自然口播音色 + 语气标签（停顿、轻笑、语速……） |
| **人设你说了算** | 主播、听众、风格、节目名 —— 全局或单集 |
| **AI 可调用** | 内置 MCP，Cursor / Claude 等可创建节目、查任务 |
| **知识能留下** | 自动闪卡，关键点可复习 |
| **数据在本地** | 单用户私有部署，任务与进度留在本机 |

完整列表见 [功能清单](./features.md)。

## 界面

<div class="bokebox-gallery">
  <figure>
    <img src="/img/banner_zh.webp" alt="BokeBox Banner" />
    <figcaption>品牌视觉</figcaption>
  </figure>
  <figure>
    <img src="/img/home.webp" alt="桌面" />
    <figcaption>桌面</figcaption>
  </figure>
  <figure>
    <img src="/img/player.webp" alt="播放" />
    <figcaption>播放</figcaption>
  </figure>
  <figure>
    <img src="/img/starmap.webp" alt="星图" />
    <figcaption>星图</figcaption>
  </figure>
  <figure>
    <img src="/img/mcp.webp" alt="MCP 设置" />
    <figcaption>MCP 设置</figcaption>
  </figure>
</div>

## 谁适合用

- 收藏夹永远「稍后处理」的知识工作者  
- 通勤 / 家务时想消化长内容的人  
- 想做「只给自己听」节目、又不想对着麦录的人  
- 需要私有部署、数据不出域的个人或小团队  

## 开源与归属

本项目采用 **LGPL-3.0-only** 开源协议。

- 源码：<https://github.com/vastsa/BokeBox>
- Issues：<https://github.com/vastsa/BokeBox/issues>
- License：仓库根目录 `LICENSE`

## 继续阅读

- [快速开始](./getting-started.md)
- [架构概览](./architecture.md)
- [MCP 接入](./mcp.md)
- [插件体系](../plugins/)
