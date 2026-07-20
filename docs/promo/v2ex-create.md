# V2EX · 分享创造节点 · BokeBox 发帖稿（可直接粘贴）

> 更新时间：2026-07-20  
> 仓库：https://github.com/vastsa/BokeBox  
> 协议：LGPL-3.0-only  
> 节点：
> - [分享创造](https://www.v2ex.com/go/create)（首选：个人开源 / 创作分享）
> - [推广](https://www.v2ex.com/go/promotions)（营销、拉新、强转化时再用）
>
> 关联素材：
> - `docs/promo/submission-templates.md`（第 10 节通用长稿）
> - `docs/promo/blog-bokebox-content-in-podcast-out.md`（深度博文）
>
> **说明**：本文件用于本地草稿与发帖复用；发帖时只复制「标题 + 正文」即可。

---

## 0. 发帖前速览

### 节点怎么选

| 场景 | 节点 | 说明 |
| --- | --- | --- |
| 个人开源、无付费墙、讲创作过程 | `分享创造` | 首选，曝光与讨论质量更好 |
| 商业推广、福利拉新、强营销感 | `推广` | 官方归类营销内容的节点 |
| 技术求助、部署踩坑 | `问与答` 等 | 别塞硬自荐，容易反感 |

### 账号与时机

| 项 | 建议 |
| --- | --- |
| 账号 | 优先老号；分享创造对新号常见约 30 天冷却 |
| 互动 | 发帖前有一定正常回帖记录，降低「纯推销号」观感 |
| 时段 | 工作日 10:00–12:00 或 20:00–22:00 |
| 节奏 | 同内容不跨节点连刷；被挪到推广后别硬刚 |

### 文案原则

| 做 | 不做 |
| --- | --- |
| 标题短、像做完一件事 | 「最强 / 吊打 / 革命性」 |
| 痛点 → 做法 → 差异 → 链接 → 求反馈 | 堆 Star 数字、硬广话术 |
| 强调 MCP / 插件 / 私有部署 / 多源输入 | 夹私活外链、支付、拉群 |
| 结尾用开放问题拉讨论 | 只喊「求 Star / 求转发」 |

### 建议附图

| 图 | URL |
| --- | --- |
| Banner | https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp |
| 首页 | https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp |
| 播放页 | https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp |

> 优先在 V2EX 上传为附件；外链不稳定时可退回 raw 图链。

---

## 1. 推荐标题（选 1）

### A. 主推（默认）

```text
开源了一个私人 AI 播客工作室：把视频/链接/文稿变成真正能听完的节目
```

### B. 偏技术差异

```text
做了 BokeBox：多源内容 → 私人口播（MCP + Source 插件 + Docker）
```

### C. 偏自荐开源

```text
自荐开源：BokeBox，一台只属于你的 AI 播客匣
```

---

## 2. 正文（分享创造 · 论坛友好版 · 直接粘贴）

```markdown
收藏了一堆技术分享、课程、会议纪要、长文，结果永远「稍后处理」。
通勤时只想消化信息，手机里却只剩短视频噪音。
也试过一些 AI 播客 demo：声音假、人设死、像念字幕，两分钟就关。

于是做了开源项目 **BokeBox（播匣）**：一台可私有部署的 AI 播客工作室。

它不是「某一种格式转音频」，而是：

视频 / 链接 / 文稿 / 会议与课程材料
→ 理解内容
→ 按主播人设重写成口播稿
→ 用你指定的音色说出来
→ 生成封面、闪卡、听播进度
→ 变成随时可听的私人节目

核心不是格式转换，是内容消化。

**差异点**

- 口播结构：有开场/重点/收尾，不是干念字幕
- 人设 + 音色可定制
- 听完有知识闪卡
- MCP 原生：Cursor / Claude 可直接 `create_podcast_from_url` / `list_jobs`
- Source 插件：内容源可插拔，不改主程序
- 单用户本地 / Docker 部署，数据在自己机器上

**仓库**

https://github.com/vastsa/BokeBox

协议：LGPL-3.0

**快速启动**

```bash
git clone https://github.com/vastsa/BokeBox.git
cd BokeBox
cp .env.example .env
./start.sh
# http://localhost:5173
```

Docker：

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# http://localhost:8787
```

**界面**

首页：
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp

播放页：
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp

Banner：
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp

想听听大家真实会丢什么内容进匣：
会议纪要？课程回放？技术长文？还是别的？

也欢迎直接提 Issue / PR。
```

---

## 3. 精简版正文（字数紧 / 二次补发时用）

```markdown
做了开源项目 **BokeBox（播匣）**：把视频、链接、文稿、会议与课程等内容，变成可听完的私人播客。

- 口播结构重写（不是念字幕）
- 自定义主播人设 + 音色
- 自动闪卡
- MCP：AI 助手可直接创建节目 / 查任务
- Source 插件：自定义内容源
- Docker / 本地单用户部署，数据私有

GitHub：https://github.com/vastsa/BokeBox  
协议：LGPL-3.0

```bash
cp .env.example .env && ./start.sh
```

欢迎试用和拍砖。你们最想先消化的内容类型是什么？
```

---

## 4. 发帖步骤

1. 打开 [分享创造](https://www.v2ex.com/go/create)
2. 点「创建新主题」
3. 粘贴 **标题 A**（或 B/C）
4. 粘贴 **第 2 节正文**
5. 上传首页 / 播放页截图（可选 Banner）
6. 发布
7. 1–2 小时内盯评论，优先回部署、TTS、MCP、插件问题

---

## 5. 发帖后维护

### 回复口径（示例）

| 对方问 | 你怎么回 |
| --- | --- |
| 怎么部署 | 贴 `./start.sh` 与 Docker 两条路径，给默认端口 |
| 和「视频转音频」有何区别 | 强调口播重写 + 人设音色 + 闪卡 + 多源输入 |
| MCP 怎么接 | 给 `POST /mcp` + Cursor 配置片段，Token 在设置页复制 |
| 支持什么输入 | 视频 / 链接 / 文稿 / 会议课程；其余走 Source 插件 |
| 是否收费 | 开源自托管；协议 LGPL-3.0，数据在自己机器 |

### 不要做的事

- 不要只回「谢谢支持」后消失
- 不要在评论区夹无关推广链接
- 不要同文连发多贴
- 不要因为被挪节点就对骂；下一篇更技术、更过程向

---

## 6. 发帖前 1 分钟自检

- [ ] 账号可在「分享创造」发帖（未触发新号冷却）
- [ ] 标题无夸张营销词
- [ ] 正文已写清：多源输入、MCP、Source 插件、私有部署
- [ ] GitHub 与 LGPL-3.0 保留
- [ ] 启动命令可复制（`./start.sh` / Docker）
- [ ] 准备 2–3 张截图
- [ ] 结尾有开放问题，方便讨论
- [ ] 无支付 / 中转 / 拉群等外链

---

## 7. 与其他渠道的关系

| 渠道 | 材料 |
| --- | --- |
| V2EX 分享创造 | **本文件** |
| 小众软件 | `docs/promo/appinn-meta-self-recommend.md` |
| 周刊 / Awesome / HelloGitHub | `docs/promo/submission-templates.md` |
| 博客 / 公众号 / 掘金 | `docs/promo/blog-bokebox-content-in-podcast-out.md` |
| GitHub About | `docs/promo/github-about-zh-en.md` |

---

完。复制第 1–2 节即可发帖。
