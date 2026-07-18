# BokeBox 各渠道投稿模板（中英 + 图文）

> 更新时间：2026-07-17  
> 仓库：https://github.com/vastsa/BokeBox  
> 协议：LGPL-3.0-only  
> 目标：按各周刊 / 列表仓库的**真实投稿格式**准备可直接粘贴的文案，并嵌入 README 已有截图。

---

## 0. 公共素材（先收藏）

### 链接

| 用途 | URL |
| --- | --- |
| GitHub | https://github.com/vastsa/BokeBox |
| 中文 README | https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md |
| 英文 README | https://github.com/vastsa/BokeBox/blob/main/README.md |
| Docker 镜像 | `ghcr.io/vastsa/bokebox:latest` |

### 可直接粘贴的图片（GitHub raw）

> Issue / PR 里请用下面链接，保证渲染稳定。

```text
Logo:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/logo.svg

中文 Banner:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp

英文 Banner:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp

中文首页:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp

英文首页:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp

中文播放页:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp

英文播放页:
https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp
```

### 一句话（复用）

**中文**

> BokeBox（播匣）：将视频、链接、文稿、会议与课程等多源内容，转化为可收听的私人播客。支持自定义主播人设与音色；内置 **MCP** 便于 AI 助手直接创建节目，**插件式内容源**可扩展接入，支持本地私有部署，数据自主可控。

**English**

> BokeBox: Turn videos, links, articles, and meeting notes into private podcasts. Customize host persona and voice, with **MCP tools for AI agents** and **pluggable source plugins**. Fully self-hosted — your data stays under your control.

### 快速启动（复用）

```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
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


### 输入范围（避免被理解成「只能转长视频」）

投稿时尽量写成：

- **视频**（本地文件 / 课程回放 / 分享录像）
- **链接**（文章、文档、公开页面等；可由 Source 插件扩展）
- **文稿**（笔记、纪要、草稿、粘贴文本）
- **会议 / 课程材料** 等需要二次消化的长内容

可选补一句：

> 核心不是「视频转音频」，而是 **多源内容 → 可听完的私人口播节目**。

### 两大可扩展能力（投稿时优先强调）

**1) MCP：让 Cursor / Claude 等 AI 直接操作 BokeBox**

- 内置 **Model Context Protocol** 端点：`POST /mcp`
- 服务启动后自动生成长期 Token（设置页一键复制）
- 常用工具：`create_podcast_from_url` / `create_podcast_from_text` / `list_jobs` / `get_job`
- 场景：在 AI 对话里说「把这个链接做成播客」，无需再点 UI

**2) Source 插件：自定义内容源，不改主程序**

- 外部插件扩展「链接 / 平台 → 可处理素材」的获取方式
- 插件默认关闭；放入 `storage/plugins/source/` 后扫描启用
- 统一产出 `SourceArtifact`，口播 / 音色 / 闪卡仍走核心流水线
- 官方示例：`examples/source-plugin-echo`
- 高风险抓取不捆绑进主仓，由用户按需安装

**一句话技术差异：**

> 不只是「某一种格式转音频」，而是把 **多种内容输入 → 可听完的私人口播**，并且 **AI 可编排（MCP）+ 源可插拔（Source Plugin）**。

**MCP 接入示例（Cursor）：**

```json
{
  "mcpServers": {
    "bokebox": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer <设置页复制的 Token>"
      }
    }
  }
}
```

**Source 插件一句话：** 把插件丢进 `storage/plugins/source/` → 设置页扫描启用 → 任务可指定或自动匹配内容源。


---

## 1. ruanyf/weekly（科技爱好者周刊）

**入口：** https://github.com/ruanyf/weekly/issues/new  
**风格：** 短、有画面、像推荐工具；标题常用 `【开源自荐】`  
**建议图：** Banner + 首页 + 播放页

### 标题（中文）

```text
【开源自荐】BokeBox：把各种内容变成私人 AI 播客（MCP + 插件式内容源）
```

### 正文（中文，直接粘贴）

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp" width="100%" alt="BokeBox" />
</p>

推荐一个我做的开源项目 **BokeBox（播匣）**。

技术分享、课程、会议纪要、长文、播客笔记……收藏了很多，却总没时间「正经消化」。  
BokeBox 的思路不是「某一种格式转音频」，而是把 **多种输入** 重写成**可听完的口播节目**：

1. 理解视频 / 网页链接 / 文稿 / 会议与课程等内容  
2. 按主播人设重写成口播脚本  
3. 用你指定的音色说出来  
4. 生成封面、闪卡和听播进度，变成私人播客  

（内容源还可通过 **Source 插件**继续扩展。）

### 为什么值得看一眼

- **真的能听完**：有开场、重点、收尾，不是干巴巴念字幕  
- **人设和音色可自定义**：像老师、产品经理，还是朋友聊天，你说了算  
- **听完还能带走闪卡**：重点不会听过就忘  
- **MCP 原生**：内置 Model Context Protocol，Cursor / Claude 等可直接 `create_podcast_from_url` 创建节目、查任务  
- **插件式自定义源**：Source 插件扩展内容获取（echo / Firecrawl 等示例），默认不捆绑高风险抓取，扫描即用  
- **单用户私有部署**：Docker 一键启动，任务与进度落本地

### 链接

- GitHub：https://github.com/vastsa/BokeBox  
- 协议：LGPL-3.0  
- 启动：`cp .env.example .env && ./start.sh`  
- Docker：`docker pull ghcr.io/vastsa/bokebox:latest && ./start.sh docker`

### 界面

**首页播客库**

![BokeBox 首页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp)

**沉浸播放页**

![BokeBox 播放页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp)

一句话：

> 内容进匣，智能成播。将多元内容转化为可随时收听的私人播客。

欢迎体验和反馈。
```

### Title (English, optional if posting EN)

```text
[Open Source] BokeBox — multi-source private AI podcasts (MCP + plugins)
```

### Body (English)

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp" width="100%" alt="BokeBox" />
</p>

I'd like to share an open-source project I built: **BokeBox**.

It's a **private AI podcast studio**. Feed it videos, web links, articles, meeting notes, course materials, or plain drafts, and it will:

1. Understand the content  
2. Rewrite it as a spoken script with a host persona  
3. Narrate it in a voice you choose  
4. Package cover art, flashcards, and listening progress into a personal podcast  

Content ingestion is also **extensible via Source plugins**.

### Why it exists

Saved talks, articles, and meeting notes are easy to bookmark and hard to finish.  
BokeBox turns “I should process this later” into “I can listen now” — for commutes, chores, and walks — without turning your notes into another public social feed.

### Highlights

- Spoken structure, not raw caption readout  
- Custom host persona + voice  
- Flashcards so knowledge survives the episode  
- **MCP-native**: AI agents can call `create_podcast_from_url` / `list_jobs` / `get_job`  
- **Pluggable Source plugins**: extend ingestion without forking core (echo / Firecrawl examples; risky fetchers not bundled)  
- Single-user, Docker self-hosted, local-first

### Links

- GitHub: https://github.com/vastsa/BokeBox  
- License: LGPL-3.0  
- Quick start: `cp .env.example .env && ./start.sh`  
- Docker: `docker pull ghcr.io/vastsa/bokebox:latest && ./start.sh docker`

### Screenshots

**Home**

![BokeBox home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)

**Player**

![BokeBox player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp)

One-liner:

> Content in. Private podcasts out.
```

---

## 2. HelloGitHub（521xueweihan/HelloGitHub）

**首选入口（官方更推荐官网）：** https://hellogithub.com/  
**仓库 Issue 模板：**  
- 中文：https://github.com/521xueweihan/HelloGitHub/issues/new?template=submit-cn.yaml  
- 英文：https://github.com/521xueweihan/HelloGitHub/issues/new?template=submit-en.yaml  

**硬性约束（来自模板）：**

- 项目标题 ≤ 50 字  
- 项目描述 **32–256 字符**  
- 类别建议：`人工智能`（中文）/ `Machine Learning` 或 `JS`（英文，按你主栈二选一；更偏产品可用 Other / 人工智能）  
- 描述**不要直接复制 README**  
- 可上传截图

### 中文表单填写稿

**标题前缀自动是：** `[开源推荐] `  
你可补成：

```text
[开源推荐] BokeBox：把多种内容变成私人 AI 播客
```

| 字段 | 填写内容 |
| --- | --- |
| 项目地址 | `https://github.com/vastsa/BokeBox` |
| 类别 | `人工智能` |
| 项目标题 | `把视频/链接/文稿变成可听完的私人播客` |
| 项目描述 | 见下（务必卡在 32–256 字） |
| 亮点 | 见下 |
| 示例代码 | 可选，见下 |
| 截图或演示视频 | 粘贴图片链接或直接拖图 |

**项目描述（约 120 字，符合 32–256）：**

```text
BokeBox（播匣）是可自托管的 AI 私人播客工作室：视频、链接、文稿、会议/课程等多种内容进匣，按自定义人设与音色生成可听完的口播节目，并带封面与闪卡。内置 MCP；Source 插件扩展内容源，数据留本机。
```

**亮点：**

```text
1. 口播结构重写，不是字幕朗读  
2. 主播人设 / 音色可自定义，并生成知识闪卡  
3. **MCP 原生**：AI 助手可直接创建节目、查询任务  
4. **Source 插件**扩展自定义内容源，不改主仓即可接入  
5. Docker 私有部署，面向个人消化而非公域社交
```

**示例代码（可选）：**

````markdown
```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
cp .env.example .env
./start.sh
# 打开 http://localhost:5173
```
````

**截图或演示视频：**

```markdown
![首页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp)
![播放页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp)
![Banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp)
```

### English form

**Title:**

```text
[Open Source] BokeBox: turn multi-source content into private podcasts
```

| Field | Content |
| --- | --- |
| Project URL | `https://github.com/vastsa/BokeBox` |
| Category | `Machine Learning`（或 `Other`） |
| Project Title | `Private AI studio for videos, links, and drafts` |
| Project Description | below |
| Highlights | below |
| Screenshots | image links |

**Project Description (keep 32–256 chars):**

```text
BokeBox is a self-hosted AI podcast studio for videos, links, articles, and notes: custom persona & voice, covers, flashcards. MCP for agent control; Source plugins for custom ingestion. Data stays local.
```

**Highlights:**

```text
1. Spoken-structure scripts, not caption readout
2. Custom host persona/voice + auto flashcards
3. **MCP-native**: agents can create podcasts and query jobs
4. **Pluggable Source plugins** for custom content ingestion
5. Docker self-host; private digestion, not public social feeds
```

**Screenshots:**

```markdown
![Home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)
![Player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp)
![Banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp)
```

---

## 3. 1c7/chinese-independent-developer（中国独立开发者项目列表）

**入口：** PR 优先，也可 Issue  
**规范：** https://github.com/1c7/chinese-independent-developer/blob/master/CONTRIBUTING.md  

**重要规则：**

- 主版面：打开即用的网站 / App  
- 程序员版面：需要命令行 / 写代码的开发者工具  
- BokeBox 若以 **Docker/自托管开源工具** 为主，更稳妥放：  
  `pages/README-Programmer-Edition.md`  
- 若你有**在线 Demo / 打开即用站点**，可放主版面 `README.md`  
- 状态：已上线用 `:white_check_mark:`，开发中用 `:clock8:`

### 3A. 程序员版面条目（推荐，适配自托管）

**PR 标题：**

```text
添加 BokeBox（AI 私人播客匣）
```

**PR 正文：**

```markdown
## 项目简介

BokeBox（播匣）把视频 / 链接 / 文稿 / 会议与课程等内容变成可听完的私人 AI 播客：自定义主播人设与音色，自动生成口播脚本、音频、封面和知识闪卡；内置 MCP 供 AI 助手直接创建节目，并支持插件式自定义内容源（Source Plugin），Docker 私有部署。

- GitHub：https://github.com/vastsa/BokeBox
- 协议：LGPL-3.0

## 检查

- [x] 已遵循 `CONTRIBUTING.md` 的条目格式
- [x] 已放入 `pages/README-Programmer-Edition.md`
- [x] 已通过 `git diff --check`
```

**要插入的列表行（改成你的名字/城市）：**

```markdown
#### vastsa - [Github](https://github.com/vastsa)
* :white_check_mark: [BokeBox](https://github.com/vastsa/BokeBox)：AI 私人播客工作室，把视频/链接/文稿/会议课程等变成可听完的口播节目；支持人设/音色、闪卡、MCP 与插件式内容源，可 Docker 私有部署 - [更多介绍](https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md)
```

### 3B. 主版面条目（仅当你有可打开的 Web 产品页时）

```markdown
#### vastsa - [Github](https://github.com/vastsa)
* :white_check_mark: [BokeBox 播匣](https://github.com/vastsa/BokeBox)：将视频、链接、文稿等多源内容转化为可收听的私人 AI 播客；支持自定义人设与音色，内置 MCP 与插件式内容源，本地私有部署 - [更多介绍](https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md)
```

### 3C. 若走 Issue 而不是 PR

```markdown
## 希望收录 BokeBox

**版面：** 程序员版面（需 Docker / 本地部署）

**条目：**

#### vastsa - [Github](https://github.com/vastsa)
* :white_check_mark: [BokeBox](https://github.com/vastsa/BokeBox)：AI 私人播客工作室，把视频/链接/文稿/会议课程等变成可听完的口播节目；支持人设/音色、闪卡、MCP 与插件式内容源，可 Docker 私有部署 - [更多介绍](https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md)

**截图：**

![banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp)
![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp)
![player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp)
```

---

## 4. howie6879/weekly（老胡的信息技术周刊）

**入口：** 新建 Issue（其旧「Issue #1 自荐」可能已不可用，以当前开放 Issue 为准）  
https://github.com/howie6879/weekly/issues/new  

**当前活跃风格：**  
`【开源自荐】` / `【工具自荐】` + 痛点 + 亮点 + 图

### 标题

```text
【开源自荐】BokeBox：私人 AI 播客匣 — 视频/链接/文稿都能进（MCP + 插件源）
```

### 正文（中文）

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/logo.svg" width="72" alt="logo" />
</p>

# BokeBox · 播匣

项目地址：https://github.com/vastsa/BokeBox  

官网 / 文档：https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md  

Docker：`ghcr.io/vastsa/bokebox:latest`

---

## 这个工具是做什么的？

BokeBox 是一台**只属于你的 AI 播客工作室**。

输入不限于长视频——**本地视频、网页链接、文章、会议纪要、课程材料、纯文稿**都可以进匣；也可通过 **Source 插件**扩展更多内容源。它会：

1. 理解内容  
2. 按你的主播人设重写成口播稿  
3. 用你选的音色生成音频  
4. 附上封面、知识闪卡和听播进度  

适合在通勤、家务与碎片时间中，系统化消化长内容。

---

## 有什么特点？

- **口播结构，不是念字幕**：开场、重点、收尾完整  
- **人设 / 音色可定制**：老师风、产品经理风、朋友闲聊都行  
- **闪卡复盘**：听完还能带走知识点  
- **MCP 原生**：内置 Model Context Protocol，Cursor / Claude 等可直接创建节目、查任务（`create_podcast_from_url` 等）  
- **插件式自定义源**：Source 插件扩展内容获取；官方示例含 echo / Firecrawl，高风险抓取不进主仓  
- **私有部署**：Docker 一键，单用户，数据落本地  

---

## 为什么我觉得适合周刊

它不是又一个云端 AI demo，而是一个**可自托管、可被 AI 编排、源可插拔**的个人信息消化系统。  
若你需要将收藏的长内容转化为可听节目，并希望接入自有 Agent 工作流，BokeBox 值得一试。

---

## 截图

![Banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp)

![首页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp)

![播放页](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp)

---

## 快速体验

```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
cp .env.example .env
./start.sh
```

协议：LGPL-3.0  
如果题材不合适，直接关闭即可，谢谢！
```

### English short version（可选）

```markdown
**BokeBox** — private AI podcast studio  
GitHub: https://github.com/vastsa/BokeBox  

Turn videos, links, articles, and notes into finishable spoken episodes — with custom host persona, voice, flashcards, local-first deployment, **MCP agent control**, and **pluggable Source plugins**.

![banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp)
![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)
![player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp)
```

---

## 5. eryajf/learning-weekly（二丫讲梵 · 学习周刊）

**入口（开源推荐模板）：**  
https://github.com/eryajf/learning-weekly/issues/new?template=issue-open-source-recommendation.md  

**字段要求：** 项目地址 / 官网 / 语言类别 / 标题 / 描述 / 截图

### 标题

```text
【开源自荐】BokeBox：多源内容 → 私人 AI 播客（MCP + Source 插件 + Docker）
```

### 正文（按模板字段）

```markdown
- 项目地址：https://github.com/vastsa/BokeBox

- 项目官网：https://github.com/vastsa/BokeBox/blob/main/README.zh-CN.md

- 语言类别：TypeScript / Node.js（前端 + 服务端），支持 Docker 部署

- 项目标题：BokeBox（播匣）—— 多源内容变成可听完的私人 AI 播客

- 项目描述：
  BokeBox 是单用户私有部署的 AI 播客工作室。输入可以是视频、网页链接、文章、会议/课程材料或纯文稿；AI 会按自定义主播人设重写成口播脚本，生成音频、封面和知识闪卡。特色是 **MCP 原生**（AI 助手可直接创建/查询任务）与 **插件式自定义内容源**（Source Plugin）。数据留在本机，适合终身学习者和自托管用户。

- 截图：

![banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp)

![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp)

![player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp)

快速启动：

```bash
cp .env.example .env && ./start.sh
# 或
docker pull ghcr.io/vastsa/bokebox:latest && ./start.sh docker
```
```

---

## 6. chinesehuazhou/python-weekly（Python 潮流周刊，可选）

**入口：** https://github.com/chinesehuazhou/python-weekly/issues/new  
**注意：** 近年偏付费订阅；且 BokeBox 并非 Python 主栈，**匹配度一般**，仅作备选。

### Title

```text
[Project] BokeBox — private AI podcast studio (self-hosted)
```

### Body

```markdown
I'd like to recommend an open-source project (not Python-centric, but useful for learning/knowledge digestion workflows):

**BokeBox**: https://github.com/vastsa/BokeBox

It turns videos, links, articles, and notes into private AI podcasts with custom host persona, voice, flashcards, Docker self-hosting, MCP agent control, and pluggable Source plugins for custom content ingestion.

![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)
![player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp)

If it's out of scope for Python Weekly, feel free to close. Thanks!
```

---

## 7. awesome-selfhosted（长期流量，要求最严）

**数据仓：** https://github.com/awesome-selfhosted/awesome-selfhosted-data  
**方式：** 新增 `software/bokebox.yml` 并发 PR（或先开 Addition Issue）  
**模板：** https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/.github/ISSUE_TEMPLATE/addition.md  

### ⚠️ 提交前自检（官方强制）

- [ ] 项目**活跃维护**
- [ ] **首次发布超过 4 个月**（不满足就先别投，等够时间）
- [ ] 安装文档可运行
- [ ] 未在 awesome-sysadmin 等重复列表机械灌水
- [ ] 一次只提一个软件

### Issue 标题

```text
Add BokeBox
```

### YAML（Issue / PR 文件内容）

> `depends_3rdparty: true`：因为生成能力依赖你配置的 LLM / TTS API（即便应用本体可自托管）。  
> tags 首项决定单页列表归类，优先放更贴的类。

```yaml
name: "BokeBox"
website_url: "https://github.com/vastsa/BokeBox"
source_code_url: "https://github.com/vastsa/BokeBox"
description: "Private AI podcast studio that turns videos, links, articles, and notes into spoken episodes with custom personas/voices, MCP agent control, and pluggable source plugins."
licenses:
  - LGPL-3.0
platforms:
  - Nodejs
  - Docker
tags:
  - Media Streaming - Audio Streaming
  - Generative AI
  - Knowledge Management Tools
depends_3rdparty: true
demo_url: ""
related_software_url: ""
```

### PR 说明正文（英文为主，社区习惯）

```markdown
## Add BokeBox

BokeBox is a single-user, self-hosted AI podcast studio.

Users drop in videos, URLs, articles, meeting notes, or drafts; it rewrites them into spoken scripts, narrates with custom host persona & voice, and produces cover art + flashcards + listening progress. It is MCP-native (AI agents can create and query jobs) and supports pluggable Source plugins for custom content ingestion.

- Source: https://github.com/vastsa/BokeBox
- License: LGPL-3.0
- Install: Docker / `./start.sh`
- Screenshots:
  - https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp
  - https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp

### Checklist
- [x] One item per PR
- [x] Searched existing issues/PRs
- [x] Actively maintained
- [ ] First release older than 4 months  <!-- 若不满足请先不要提交 -->
- [x] Working installation instructions
```

---

## 8. ai-collection/ai-collection（AI 应用合集，可选）

**入口：** https://github.com/ai-collection/ai-collection  
**说明：** 列表偏 AI 应用展示；提交前先看 README / Issue 是否仍收 PR。下面给通用图文稿。

### Title

```text
Add BokeBox — private AI podcast studio
```

### Body

```markdown
## BokeBox

Private AI podcast studio: turn videos, links, articles, and notes into finishable spoken episodes.

- GitHub: https://github.com/vastsa/BokeBox
- License: LGPL-3.0
- Self-hosted / Docker
- Custom host persona + voice + flashcards
- MCP-native agent control
- Pluggable Source plugins for custom content sources

![banner](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp)
![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)
![player](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp)

### One-liner
Content in. Private podcasts out.
```

---

## 9. tauri-apps/awesome-tauri（仅当主推 Tauri 桌面端）

**入口：** https://github.com/tauri-apps/awesome-tauri  
**现状：** 若当前发布物主要是 Web + Docker，而不是 Tauri 桌面安装包，**先别投**，避免被拒。

### 预留 PR 描述

```markdown
## Add BokeBox

BokeBox is a private AI podcast studio (video → spoken podcast) with custom persona/voice.

- Repo: https://github.com/vastsa/BokeBox
- Category suggestion: Apps / Productivity / Media
- License: LGPL-3.0

![home](https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp)
```

---

## 10. 通用中英「图文长稿」（可发 V2EX / 即刻 / 博客 / 即友圈）

### 中文长稿

```markdown
# BokeBox：内容进匣，AI 成播

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_zh.webp" width="100%" />
</p>

## 你是不是也有过

- 收藏了技术分享、课程、会议纪要、长文，永远「稍后处理」  
- 通勤只想消化信息，却只能刷短视频  
- 试过 AI 播客 demo：声音假、人设死，听两分钟就关  

## BokeBox 做什么

**不限于长视频。** 视频、网页链接、文章、会议纪要、课程材料、纯文稿都可以进匣；还可用 Source 插件扩展更多内容源：

1. 理解内容  
2. 写成口播稿  
3. 用你的声音说出来  
4. 变成随时可听的私人播客（含封面与闪卡）

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_zh.webp" width="90%" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_zh.webp" width="90%" />
</p>

## 差异点

| 你在意的 | BokeBox |
| --- | --- |
| 能听完 | 口播结构，不是念字幕 |
| 像真人在讲 | 人设 + 音色可定制 |
| 听完不忘 | 自动知识闪卡 |
| AI 可编排 | **MCP**：助手直接创建节目 / 查任务 |
| 源可扩展 | **Source 插件**自定义内容获取 |
| 数据安全 | 单用户私有部署 |

## 开源地址

https://github.com/vastsa/BokeBox  

```bash
cp .env.example .env && ./start.sh
```

**内容进匣，AI 成播。** 如果这个方向戳中你，欢迎 Star 和提 Issue。
```

### English long-form

```markdown
# BokeBox: Content in. Private podcasts out.

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/banner_en.webp" width="100%" />
</p>

BokeBox is a **private AI podcast studio**.

Feed it videos, web links, articles, meeting notes, course materials, or plain drafts — and extend more sources via plugins. It rewrites the content as a spoken script, narrates it with your host persona and voice, and ships cover art + flashcards + listening progress.

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/home_en.webp" width="90%" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/vastsa/BokeBox/main/docs/img/lis_en.webp" width="90%" />
</p>

### Why
- Finishable spoken structure (not caption readout)
- Custom persona & voice
- Flashcards after listening
- **MCP-native** agent control (`create_podcast_from_url`, …)
- **Pluggable Source plugins** for custom content sources
- Single-user, self-hosted, Docker-ready

### Repo
https://github.com/vastsa/BokeBox

```bash
cp .env.example .env && ./start.sh
```
```

---

## 11. 建议投放顺序与节奏

| 顺序 | 渠道 | 动作 | 预计耗时 |
| --- | --- | --- | --- |
| 1 | `1c7/chinese-independent-developer` | 按格式开 PR | 15–30 min |
| 2 | `ruanyf/weekly` | 发图文 Issue | 10 min |
| 3 | HelloGitHub | 官网或 Issue 模板 | 15 min |
| 4 | `howie6879/weekly` | 发自荐 Issue | 10 min |
| 5 | `eryajf/learning-weekly` | 用开源推荐模板 | 10 min |
| 6 | `awesome-selfhosted-data` | 满足 4 个月发布后再投 | 30–60 min |
| 7 | `ai-collection` 等 | 可选补强 | 视情况 |

**注意：**

1. 同一周内连投没问题，但文案应略有差异，避免像群发。  
2. HelloGitHub 对「复制 README」较敏感，描述已单独改写。  
3. selfhosted 的 **4 个月发布门槛** 不满足就先积累 stars / release。  
4. 截图优先用 raw.githubusercontent.com，避免本地上传失败。  
5. 保留 LGPL-3.0 与仓库地址，不改归属信息。

---

## 12. 投稿前 2 分钟自检清单

- [ ] README 中英文都可打开，截图可外链访问  
- [ ] `.env.example` 与 `./start.sh` / Docker 路径有效  
- [ ] 一句话能说清「不限于长视频：多源内容 → 可听完的私人口播工作室」  
- [ ] 已点名 **MCP**（AI 可直接创建节目）与 **Source 插件**（自定义内容源）  
- [ ] 输入示例至少覆盖：视频 / 链接 / 文稿（可加会议、课程）  
- [ ] 准备 3 张图：Banner / 首页 / 播放页  
- [ ] 各渠道标题前缀符合对方习惯（`【开源自荐】` / `[开源推荐]`）  
- [ ] 独立开发者列表写清版面（主版面 vs 程序员版面）  
- [ ] selfhosted 已核对 license / tags / 4 个月门槛  

---

完。直接从对应章节复制到各仓库即可。
