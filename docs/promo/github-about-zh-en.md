# GitHub 仓库介绍文案（中英文）

> 用于仓库 **About**、社交转发、Release 说明等。  
> 口径：多源内容 + MCP + Source 插件 + 私有部署。  
> 仓库：https://github.com/vastsa/BokeBox  
> Homepage：https://bokebox.aiuo.net  
> License：LGPL-3.0-only

---

## 1. GitHub About（仓库右上角 Description，≤350 字符）

### 推荐：中英双语（默认写入 GitHub）

```text
BokeBox: private AI podcast studio — videos/links/articles/notes → spoken episodes. Custom persona & voice, MCP + pluggable sources, self-hosted. BokeBox（播匣）：私人 AI 播客工作室；多源内容成播，MCP 与插件源，本地私有部署。
```

字符数：200

### English only

```text
BokeBox: Content in, private podcasts out. Multi-source AI podcast studio (videos/links/articles/notes) with custom persona & voice, MCP + pluggable sources. Self-hosted. LGPL-3.0
```

字符数：179

### 简体中文 only

```text
BokeBox（播匣）：私人 AI 播客工作室。将视频、链接、文稿、会议与课程等内容转化为可收听的私人播客；人设与音色可自定义，支持 MCP 与插件式内容源，本地私有部署。LGPL-3.0
```

字符数：86

### Website

```text
https://bokebox.aiuo.net
```

---

## 2. Topics（建议勾选 / 填写）

```text
ai
podcast
tts
mcp
self-hosted
docker
typescript
nodejs
open-source
productivity
knowledge-management
speech-synthesis
personal-knowledge
lgpl
```

精简版（若只保留 8 个）：

```text
ai
podcast
tts
mcp
self-hosted
docker
typescript
productivity
```

---

## 3. 一句话 Slogan

### 中文

```text
内容进匣，AI 成播。
```

稍长：

```text
把视频、链接、文稿、会议与课程等多种内容，变成真正能听完的私人播客。
```

### English

```text
Content in. Private podcasts out.
```

稍长：

```text
Turn videos, links, articles, meetings, and courses into private podcasts you can actually finish.
```

---

## 4. 短介绍（约 50–80 字 / 40–60 words）

### 中文

```text
BokeBox（播匣）是可自托管的私人 AI 播客工作室。支持视频、链接、文稿、会议与课程等多源输入，按自定义人设与音色生成可听完的口播节目，并附带封面与知识闪卡；内置 MCP，内容源可通过插件扩展。
```

### English

```text
BokeBox is a self-hosted private AI podcast studio. Feed it videos, links, articles, meeting notes, or course materials; it rewrites them into finishable spoken episodes with custom host persona and voice, plus covers and flashcards. MCP-native, with pluggable source plugins.
```

---

## 5. 中等介绍（约 120–180 字 / 90–130 words）

### 中文

```text
BokeBox（播匣）面向「内容消化」而不是「公域内容生产」。你可以把视频、网页链接、文章、会议纪要、课程材料或纯文稿丢进匣子，AI 会按你设定的主播人设重写成口播脚本，用指定音色生成音频，并附上封面、知识闪卡与听播进度。

它内置 MCP，Cursor / Claude 等 AI 助手可直接创建节目与查询任务；也支持 Source 插件扩展自定义内容源。单用户私有部署，数据留在本机，适合终身学习者、创作者与注重隐私的自托管用户。开源协议 LGPL-3.0。
```

### English

```text
BokeBox is built for digesting content—not shipping another public feed. Drop in videos, links, articles, meeting notes, course materials, or plain drafts. It rewrites them into spoken-structure scripts, narrates with your chosen host persona and voice, and packages covers, flashcards, and listening progress into a private show you can actually finish.

It ships with MCP so AI agents can create episodes and query jobs, plus pluggable Source plugins for custom content ingestion. Single-user and self-hosted, with data staying on your machine. Ideal for lifelong learners, creators, and privacy-minded operators. Licensed under LGPL-3.0.
```

---

## 6. 长介绍（可用于 Profile README / 文档站 About）

### 中文

```markdown
**BokeBox · 播匣** 是一台只属于你的 AI 播客工作室。

大多数工具在帮你更快地「生产内容」。  
BokeBox 更在意帮你更好地「消化内容」。

它不把输入锁死在长视频上。视频、链接、文稿、会议与课程材料都可以进匣；还可通过 Source 插件继续扩展内容源。AI 会把内容重写成可听完的口播结构，用你指定的人设与音色讲述，并生成封面、知识闪卡和听播进度。

技术上，BokeBox 内置 MCP（Model Context Protocol），让 Cursor / Claude 等 AI 助手直接创建节目、查询任务；同时以插件方式扩展内容获取，高风险抓取默认不捆绑进主仓。部署上支持 Docker 与本地启动，单用户私有，数据落在你自己的机器。

开源地址：https://github.com/vastsa/BokeBox  
协议：LGPL-3.0  
主页：https://bokebox.aiuo.net
```

### English

```markdown
**BokeBox** is a private AI podcast studio that belongs only to you.

Most tools help you produce content faster.  
BokeBox helps you digest content better.

Inputs are multi-source by design: videos, links, articles, meetings, and course materials—not long videos alone. Source plugins can extend ingestion further. The system rewrites content into spoken structure, narrates it with your host persona and voice, and ships covers, flashcards, and listening progress.

Technically, BokeBox is MCP-native so agents can create episodes and query jobs, and plugin-friendly so custom sources can be added without forking the core. Deploy with Docker or local scripts as a single-user private instance; your data stays on your machine.

Repo: https://github.com/vastsa/BokeBox  
License: LGPL-3.0  
Homepage: https://bokebox.aiuo.net
```

---

## 7. Social / 推文级（可直接发）

### 中文

```text
开源了 BokeBox（播匣）：内容进匣，AI 成播。

视频 / 链接 / 文稿 / 会议课程 → 可听完的私人播客
• 人设 & 音色可自定义
• MCP：AI 助手直接创建节目
• Source 插件：自定义内容源
• Docker 自托管，数据留本机

https://github.com/vastsa/BokeBox
```

### English

```text
Open-sourced BokeBox: Content in. Private podcasts out.

Videos / links / articles / meetings → finishable private podcasts
• Custom host persona & voice
• MCP-native agent control
• Pluggable Source plugins
• Docker self-hosted, data stays local

https://github.com/vastsa/BokeBox
```

---

## 8. 建议直接应用到 GitHub 的命令

```bash
gh repo edit vastsa/BokeBox \
  --description "BokeBox: private AI podcast studio — videos/links/articles/notes → spoken episodes. Custom persona & voice, MCP + pluggable sources, self-hosted. BokeBox（播匣）：私人 AI 播客工作室；多源内容成播，MCP 与插件源，本地私有部署。" \
  --homepage "https://bokebox.aiuo.net" \
  --add-topic ai \
  --add-topic podcast \
  --add-topic tts \
  --add-topic mcp \
  --add-topic self-hosted \
  --add-topic docker \
  --add-topic typescript \
  --add-topic nodejs \
  --add-topic productivity \
  --add-topic open-source
```

---

## 9. 与旧 About 的差异

旧描述偏「Drop videos in / 看不完的视频」。  
新描述统一为：

- 多源内容（视频 / 链接 / 文稿 / 会议课程）
- 私人可听完播客
- MCP + 插件式内容源
- 自托管 / LGPL-3.0
