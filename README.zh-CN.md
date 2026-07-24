<p align="center">
  <img src="docs/img/logo.webp" width="120" height="120" alt="BokeBox" />
</p>

<h1 align="center">BokeBox · 播匣</h1>

<p align="center">
  <b>内容进匣，AI 成播</b><br/>
  <sub>多源内容 → 可收听的私人播客。人设、音色、插件与 MCP 可扩展，本地私有部署。</sub>
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

<p align="center">
  <a href="https://github.com/vastsa/BokeBox/"><img src="https://img.shields.io/badge/Open%20Source-GitHub-181717?style=flat-square&logo=github" alt="GitHub" /></a>
  <a href="https://bokebox.aiuo.net/"><img src="https://img.shields.io/badge/Demo-%E6%BC%94%E7%A4%BA%E7%AB%99-0EA5E9?style=flat-square" alt="Demo" /></a>
  <a href="https://bkb-docs.aiuo.net/"><img src="https://img.shields.io/badge/Docs-%E6%96%87%E6%A1%A3-7C5CFF?style=flat-square" alt="Docs" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-LGPL--3.0-22C55E?style=flat-square" alt="LGPL-3.0" /></a>
  <a href="https://github.com/vastsa/BokeBox"><img src="https://visitor-badge.laobi.icu/badge?page_id=vastsa.BokeBox&left_text=visitors&left_color=555&right_color=22C55E" alt="visitors" /></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/bokebox?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bokebox" target="_blank" rel="noopener noreferrer">
    <img alt="BokeBox - Multi-source private podcasts with MCP + plugins | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1205113&theme=light&t=1784859421480" />
  </a>
</p>

<p align="center">
  <a href="https://bokebox.aiuo.net/">演示站</a> ·
  <a href="https://bkb-docs.aiuo.net/">在线文档</a> ·
  <a href="https://www.producthunt.com/products/bokebox">Product Hunt</a> ·
  <a href="#-开始使用">开始使用</a> ·
  <a href="#-界面">界面</a> ·
  <a href="#-功能全景">功能</a> ·
  <a href="#-免责声明">免责声明</a>
</p>

<p align="center">
  <img src="docs/img/banner_zh.webp" alt="BokeBox · 内容进匣，AI 成播" width="100%" />
</p>

---

## 结论先行

**BokeBox 把「看不完 / 读不完」的内容，变成你能听完、能带走的私人节目。**

| 你丢进去 | 它交还给你 |
| --- | --- |
| 视频 / 链接 / 文稿 / 会议与课程 | 口播节目 + 封面 + 闪卡 + 进度 |
| 全局或单集人设 / 音色 | 听起来像「为你做的一档节目」 |
| 插件 / MCP / 定时订阅 | 输入可扩展，AI 可直接调用 |

**一句话**：自托管的私人 AI 播客工作室 —— 数据在你这边，流水线可插拔，听感优先于堆功能。

**立刻体验**

- 演示站：<https://bokebox.aiuo.net>
- 文档站：<https://bkb-docs.aiuo.net>
- 本地三步：

```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
cp .env.example .env   # 填入 API Key
./start.sh             # http://localhost:5173
```

Docker（推荐预构建镜像）：

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker      # http://localhost:8787
```

---

## 30 秒看懂

```text
  你丢进去的                         BokeBox 交还给你的
  ─────────────                      ─────────────────
  会议录像 / 纪要                    有节奏的口播节目
  长文 / 技术分享 / 课程             主播人设 + 自然音色
  任意链接（插件可扩展）             封面 · 闪卡 · 进度记忆
```

1. **丢进去** —— 视频、链接、文稿，或插件扩展源  
2. **可选微调** —— 人设、音色、提示词  
3. **后台跑完** —— 转写 → 口播稿 → TTS → 封面 / 闪卡  
4. **戴上耳机** —— 播放器 + 专辑 + 星图 + 复习

---

## 为什么值得用

| 痛点 | BokeBox 的做法 |
| --- | --- |
| 收藏永远「稍后」 | 改成耳朵时间：通勤 / 家务 / 睡前可消化 |
| 机器念稿难听完 | AI 重写成口播结构，带人设与语气 |
| 听过就忘 | 自动闪卡，关键点可复习 |
| 输入方式太死 | Source / ASR / TTS / Schedule 插件可扩展 |
| 数据不想上云 | 单用户自托管，任务与媒体落本地 |

适合：知识工作者、通勤听播党、想做「只给自己听」节目的人、需要私有部署的个人或小团队。  
不适合：公域播客平台、多租户 SaaS、在线协作编辑。

---

## 界面

制作、听播、资产与设置，都在同一私有空间。

| 首页 | 播放 |
| :---: | :---: |
| <img src="docs/img/home.webp" width="100%" alt="BokeBox 桌面" /> | <img src="docs/img/player.webp" width="100%" alt="BokeBox 播放" /> |
| **闪卡** | **星图** |
| <img src="docs/img/flashcard.webp" width="100%" alt="BokeBox 闪卡" /> | <img src="docs/img/starmap.webp" width="100%" alt="BokeBox 星图" /> |

### 设置中心

| 人设 | 提示词 |
| :---: | :---: |
| <img src="docs/img/persona.webp" width="100%" alt="BokeBox 人设设置" /> | <img src="docs/img/prompts.webp" width="100%" alt="BokeBox 提示词模板设置" /> |
| **插件** | **MCP** |
| <img src="docs/img/plugins.webp" width="100%" alt="BokeBox 插件设置" /> | <img src="docs/img/mcp.webp" width="100%" alt="BokeBox MCP 设置" /> |
| **订阅** | **站点** |
| <img src="docs/img/schedules.webp" width="100%" alt="BokeBox 订阅设置" /> | <img src="docs/img/site.webp" width="100%" alt="BokeBox 站点设置" /> |

---

## 功能全景

<details>
<summary><b>点开看完整清单（流水线 / 听播 / 插件 / MCP / 部署）</b></summary>

### 多源输入
- 本地上传：视频 / 音频 / 文稿
- URL 导入：网页正文、公开音视频直链
- 创建时可指定 Source 插件，或自动匹配；可归入专辑、选择人设与音色

### AI 制作流水线
- 音频提取 → ASR → 口播脚本 → 封面 / 笔记 / 闪卡 → TTS
- 后台异步任务，首页可见进度；可从指定步骤重跑并跳过已完成阶段
- 支持上架听播库、重试失败、删除任务

### 人设 · 音色 · 提示词
- 全局主播人设与单集临时人设
- 预置音色 + 文字描述定制音色（Voice Design）
- 提示词模板：封面 / 口播 / 改写 / 闪卡，支持 `{{变量}}`
- 内容语言可全局默认，也可按任务指定

### 节目资产与听播
- 任务详情：转写、脚本、笔记、闪卡、封面、音频
- 沉浸播放器：进度记忆、倍速、睡眠定时（含「播完本集」）
- 专辑连续收听；星图按标签回到相关节目

### 设置中心
- **音色 / 人设 / 提示词 / AI 服务 / 插件 / 订阅 / MCP / 站点 / 账户**
- 账户支持界面语言与外观主题（跟随系统 / 亮 / 暗）

### 定时订阅
- Schedule 插件发现候选，Source 插件负责下载/解析
- 内置 RSS、URL 列表、GitHub Trending、Hacker News 等
- 去重限流、立即/强制执行、运行记录可回跳任务  
- 说明：[docs/guide/schedule.md](./docs/guide/schedule.md)

### 插件体系
- Source / ASR / TTS / Schedule 统一插件契约，设置页扫描 / 上传 zip / 启停  
- 文档与示例见 [docs/plugins/](./docs/plugins/) · [docs/development/](./docs/development/) · [examples/](./examples/)

### MCP（AI 直接调用）
- 内置 `POST /mcp`，服务端自动签发长期 Token
- 设置页复制 Cursor / Claude / Codex 安装配置
- 常用工具：`create_podcast_from_url` / `create_podcast_from_text` / `list_jobs` / `get_job` / 订阅相关工具等
- 可选 `PUBLIC_BASE_URL`：反代场景生成正确安装地址

Cursor 示例：

```json
{
  "mcpServers": {
    "bokebox": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer <在设置页复制的 Token>"
      }
    }
  }
}
```

### 部署与私有化
- `./start.sh` 开发 · `./start.sh prod` 单端口 · Docker 预构建 / 本地构建 / 国内镜像
- 单用户私有部署：SQLite + 本地存储
- 协议：**LGPL-3.0** · 仓库：https://github.com/vastsa/BokeBox

</details>

---

## 开始使用

> 想先点一点？[演示站](https://bokebox.aiuo.net) · 细节见 [在线文档](https://bkb-docs.aiuo.net)

```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
cp .env.example .env   # 填入你的 API Key
./start.sh             # http://localhost:5173
```

首次进入会引导账号初始化与模型配置。

| 方式 | 命令 | 访问 |
| --- | --- | --- |
| 本地开发 | `./start.sh` | `http://localhost:5173` |
| 单端口生产 | `./start.sh prod` | 见脚本输出 |
| Docker 预构建 | `docker pull ghcr.io/vastsa/bokebox:latest && ./start.sh docker` | `http://localhost:8787` |
| Docker 本地构建 | `./start.sh docker.local` | `http://localhost:8787` |
| 国内镜像构建 | `./start.sh docker.cn` | `http://localhost:8787` |

---

## 文档与链接

| 入口 | 地址 |
| --- | --- |
| 在线文档（中/英） | <https://bkb-docs.aiuo.net> |
| 演示站 | <https://bokebox.aiuo.net> |
| 源码文档 | 仓库 `docs/`（VitePress） |
| 插件 / 开发规范 | [docs/plugins/](./docs/plugins/) · [docs/development/](./docs/development/) |
| CI / 镜像 | [docs/ops/ci-cd.md](./docs/ops/ci-cd.md) |

```bash
pnpm docs:dev      # 本地预览文档
pnpm docs:build    # 构建
pnpm docs:preview  # 预览构建产物
```

---

## 路线与共建

- 更自然的多集节目与续听
- 更丰富的音色与提供方
- 订阅导出（如 RSS）接到已有听播软件
- 更轻的一键桌面封装

如果方向对味：

1. ⭐ **Star** 本仓库  
2. 开 Issue：你最想「播客化」哪种内容  
3. PR 欢迎 —— 体验、文案、声音与模型适配尤佳  

> **一句话安利**：BokeBox 将视频、链接、文稿、会议与课程等变成可收听的私人播客；自定义人设与音色，内置 MCP 与插件源，本地私有部署，数据自主可控。

**内容进匣，AI 成播。** 多数工具帮你更快生产内容；BokeBox 更在意帮你更好地消化内容。

---

<details>
<summary><b>附录：环境 · 命令 · 配置 · 技术栈</b></summary>

### 环境
- Node.js ≥ 22.5 · pnpm 9.x
- OpenAI 兼容 API（Chat / ASR / TTS；图片模型可选）

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `./start.sh` | 本地开发（web 5173 + API 8787） |
| `./start.sh prod` | 构建并单端口运行 |
| `./start.sh docker` | 拉取 `ghcr.io/vastsa/bokebox:latest` 并启动 |
| `./start.sh docker.local` | 本地 Dockerfile 构建并启动 |
| `./start.sh docker.cn` | 国内镜像源构建并启动 |
| `./start.sh docker:down` | 停止容器 |

### 配置要点（`.env`）

```bash
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_CHAT_MODEL=mimo-v2.5
OPENAI_TRANSCRIBE_MODEL=mimo-v2.5-asr
OPENAI_TTS_MODEL=mimo-v2.5-tts
OPENAI_TTS_DEFAULT_VOICE=冰糖
```

完整变量见 `.env.example`。

### 流水线（简图）

```text
多源输入（视频 / 链接 / 文稿 / 插件）
  → 归一化 → ASR/理解 → 口播脚本
  → 并行：封面 / 闪卡 / TTS → 听播库
```

### 技术栈
React · Vite · Fastify · SQLite · ffmpeg · pnpm monorepo

### License
[LGPL-3.0](LICENSE) — 开源；对库的衍生修改需保持 LGPL 兼容。仓库：https://github.com/vastsa/BokeBox

</details>

---

---

## 免责声明

**本项目按「原样」（AS IS）提供，仅供学习、研究与技术交流使用。** 作者与贡献者**不提供任何明示或默示担保**，包括但不限于适销性、特定用途适用性、不侵权、准确性、可用性或持续可用性。

使用、部署、修改、分发本项目（含衍生作品与第三方插件）即表示你理解并同意：

1. **合法合规由你自行负责**  
   你须遵守你所在国家/地区及使用地的全部适用法律、行政法规与监管要求，包括但不限于著作权、邻接权、个人信息与数据保护、网络安全、生成式 AI、商业秘密、平台服务条款与出口管制等。

2. **内容与权利由你自行核实**  
   你应对输入、抓取、转写、改写、合成、存储、传播的全部材料自行取得合法授权或确认属于法律允许范围；不得利用本项目实施侵权、绕过技术保护措施、未授权访问、诈骗、骚扰或其他违法用途。

3. **风险与后果由使用者承担**  
   因使用本项目产生的任何直接、间接、附带、特殊、惩罚性或后果性损害（含数据丢失、业务中断、账号封禁、第三方索赔、行政处罚等），作者与贡献者在法律允许的最大范围内**不承担任何责任**。是否启用插件、MCP、定时任务、访客访问、反代与公网暴露等能力，均由你自行评估风险。

4. **第三方服务与依赖**  
   模型 API、TTS/ASR、抓取类插件、容器镜像与其他第三方组件有其自身条款与计费规则；其可用性、费用、内容安全策略与合规义务与本项目作者无关。

5. **演示站与文档**  
   演示环境与文档示例仅用于功能展示，**不构成**产品承诺、专业建议或默示授权；请勿在演示环境写入真实密钥、隐私或受保护内容。

6. **开源协议**  
   软件授权以根目录 [LICENSE](LICENSE)（**LGPL-3.0-only**）为准。本免责声明是对风险告知与责任边界的补充说明，**不改变** LGPL 授予的权利与义务；若与适用法律强制性规定冲突，以该强制性规定为准，其余条款仍然有效。

如你不同意以上内容，请勿下载、安装、使用或分发本项目。

<p align="center">
  <b>BokeBox</b><br/>
  <sub>私人 AI 播客匣 · Open Source · LGPL-3.0</sub><br/>
  <sub><a href="https://github.com/vastsa/BokeBox/">github.com/vastsa/BokeBox</a></sub>
</p>
