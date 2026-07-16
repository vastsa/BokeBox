# BokeBox · 播匣

**AI 生成 · 人设可配的私人视频转播客**

把视频 / 链接 / 文本丢进匣子，自动完成「提取音频 → 转写 → 总结口播稿 → TTS 合成 → 封面 / 闪卡」，变成可听的私人播客。

[功能特性](#-功能特性) · [快速开始](#-快速开始) · [流水线](#-制作流水线) · [配置](#-配置说明) · [部署](#-部署) · [开发](#-本地开发)

---

## ✨ 功能特性

- **端到端自动化**：上传视频或粘贴链接，一键跑完播客制作流水线
- **AI 口播生成**：基于转写内容总结脚本，并合成自然口播音频
- **人设可自定义**：主播称呼、身份、节目名、说话风格、语气、开场收尾等
- **音色可选**：支持预置精品音色，或 VoiceDesign 文字描述定制音色
- **知识闪卡**：从内容中提炼要点卡片，方便复习
- **封面生成**：配置图片模型后自动生成播客封面
- **沉浸听播**：播放进度记忆、倍速、睡眠定时、脚本跟随
- **单用户私有化**：首次初始化账号与 API Key，数据落本地 SQLite

---

## 🖼 界面预览

| 任务详情（桌面） | 任务详情（移动） |
| --- | --- |
| ![任务详情桌面](storage/screenshots/job-v2-desktop-top.png) | ![任务详情移动](storage/screenshots/job-mobile-top.png) |

> 更多截图见 `storage/screenshots/`。

---

## 🧭 页面导览

| 路由 | 说明 |
| --- | --- |
| `#/home` | 播客库 + 制作中任务 |
| `#/create` | 上传视频 / 链接，配置人设与音色 |
| `#/jobs/:id` | 流水线资产、重试、重合成、播放 |
| `#/play/:id` | 沉浸听播 |
| `#/settings` | 账号、API Key、模型与全局人设 |

旧路径 `#/listen`、`#/admin/*` 仍兼容跳转。

---

## 🔄 制作流水线

```text
上传视频 / 链接 / 文本
        │
        ▼
   提取音频 (ffmpeg)
        │
        ▼
   ASR 语音转写
        │
        ▼
   LLM 总结播客脚本（含口播音频标签）
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   图片模型封面    知识闪卡生成    TTS 合成播客
        │              │              │
        └──────────────┴──────────────┘
                       │
                       ▼
              发布到听播前台
```

### 口播人设

上传时可选：

- **使用全局**：读取设置中的默认人设（任务创建时快照）
- **本次单独设置**：仅对本任务生效

可配置项：主播称呼、身份角色、节目名、说话风格、目标听众、语气调性、开场 / 收尾偏好、额外要求。

### TTS 模式

| 模式 | 默认模型 | 说明 |
| --- | --- | --- |
| `default` | `mimo-v2.5-tts` | 自然口播 · 预置音色 · **音频标签控制** |
| `voicedesign` | `mimo-v2.5-tts-voicedesign` | 文字描述定制音色（不支持预置音色 / 音频标签） |

**自然口播（音频标签）要点：**

- 不支持 user 侧「风格指令」
- 语气控制写在 assistant 文本内的音频标签中
- 开头风格标签：`(磁性)` `(沉稳 温柔)` `(慵懒)` …
- 正文细粒度标签：`（深呼吸）` `（轻笑）` `（沉默片刻）` `（语速加快）` …
- 生成口播稿时，LLM 会自动写入上述标签

预置音色示例：`冰糖` `茉莉` `苏打` `白桦` `Mia` `Chloe` `Milo` `Dean`（默认 `冰糖`）

---

## 🚀 快速开始

### 环境要求

- Node.js `>= 22.5`
- pnpm `9.x`（推荐 `9.15.0`）
- ffmpeg（本地 dev 也可由 `ffmpeg-static` 提供）
- 可用的 OpenAI 兼容 API（Chat / ASR / TTS，可选 Image）

### 一键启动

```bash
git clone https://github.com/<your-name>/bokebox.git
cd bokebox

cp .env.example .env
# 编辑 .env，至少填入 OPENAI_API_KEY / OPENAI_BASE_URL

chmod +x start.sh
./start.sh          # 本地开发：前端 5173 + 后端 8787
# ./start.sh prod   # 本地生产：构建后单端口托管
# ./start.sh docker # Docker Compose
```

| 模式 | 地址 |
| --- | --- |
| 开发前端 | http://localhost:5173 |
| 开发后端 | http://localhost:8787 |
| 生产 / Docker | http://localhost:8787 |

首次打开进入 **系统初始化**：设置用户名密码、API Key 与模型参数。

---

## ⚙️ 配置说明

复制 `.env.example` 为 `.env`：

```bash
PORT=8787
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_CHAT_MODEL=mimo-v2.5
OPENAI_TRANSCRIBE_MODEL=mimo-v2.5-asr
OPENAI_TTS_MODEL=mimo-v2.5-tts
OPENAI_TTS_VOICEDESIGN_MODEL=mimo-v2.5-tts-voicedesign
OPENAI_TTS_DEFAULT_VOICE=冰糖
VITE_API_BASE=/api
OPENAI_IMAGE_MODEL=

# URL 抓取
URL_FETCH_JINA=1
# JINA_API_KEY=
URL_FETCH_PLAYWRIGHT=0
```

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | API Key（也可在设置页配置） |
| `OPENAI_BASE_URL` | OpenAI 兼容接口 Base URL |
| `OPENAI_*_MODEL` | Chat / ASR / TTS / Image 模型名 |
| `OPENAI_TTS_DEFAULT_VOICE` | 默认预置音色 |
| `URL_FETCH_JINA` | 是否用 Jina Reader 绕过部分站点反爬 |
| `URL_FETCH_PLAYWRIGHT` | 是否启用本地 Playwright 渲染抓取 |

> 模型默认对齐 [MiMo](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5) 能力；只要接口兼容 OpenAI 形态，也可换成其他提供方。

---

## 📁 存储布局

任务与收听进度使用 **SQLite**（`storage/app.db`）。媒体按任务聚合：

```text
storage/
  app.db
  jobs/
    {jobId}/
      source.mp4        # 原始上传
      audio.mp3         # 可听源音频
      asr.mp3           # ASR 专用
      transcript.txt    # 转写稿
      script.txt        # 播客脚本
      shownotes.md      # 节目笔记
      flashcards.json   # 知识闪卡
      podcast.mp3       # 合成播客
```

- 首次启动会自动从旧版 `jobs.json` / `listen.json` 迁移
- 旧版摊开目录会在启动时迁入 `jobs/{id}/`

---

## 🏗 项目结构

```text
bokebox/
├── apps/
│   ├── server/          # Fastify API · 流水线 · SQLite
│   └── web/             # React + Vite 前台
├── storage/             # 运行时数据（默认 gitignore）
├── docs/                # 补充文档（CI/CD 等）
├── docker-compose.yml
├── Dockerfile
├── start.sh             # 一键启动
└── package.json         # pnpm monorepo
```

**技术栈**

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite · Tailwind CSS 4 |
| 后端 | Fastify 5 · TypeScript · Zod |
| 媒体 | ffmpeg / fluent-ffmpeg |
| 数据 | SQLite |
| 包管理 | pnpm workspace |

---

## 🐳 部署

### Docker Compose（本地构建）

```bash
cp .env.example .env
./start.sh docker
# 或
docker compose up -d --build
```

- 镜像内由 Fastify 同时提供 API + 前端静态资源
- `./storage` 挂载持久化
- 健康检查：`GET /api/health`

### 拉取预构建镜像

```bash
export GHCR_IMAGE=ghcr.io/<owner>/bokebox
export IMAGE_TAG=latest
./start.sh docker:prod
```

### GitHub Actions + GHCR

推送到 `main` 或打 `v*` tag 可自动构建多架构镜像（见 `docs/ci-cd.md`）：

```text
ghcr.io/<owner>/bokebox:latest
ghcr.io/<owner>/bokebox:sha-<short>
ghcr.io/<owner>/bokebox:1.0.0
```

---

## 🛠 本地开发

```bash
pnpm install
pnpm dev                 # 前后端并行热更新
pnpm --filter @person-boke/web dev
pnpm --filter @person-boke/server dev
pnpm build
pnpm start               # 仅启动已构建的 server
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `pnpm start:app` | `./start.sh` 开发模式 |
| `pnpm start:prod` | 构建后单端口运行 |
| `pnpm docker:up` | Compose 启动 |
| `pnpm docker:down` | Compose 停止 |

---

## 🔒 安全说明

- 面向 **单用户私有部署**，请勿直接裸奔公网而不加反向代理 / HTTPS
- API Key 可写在 `.env` 或设置页；**不要提交** `.env` 与 `storage/`
- 修改默认密码，并限制宿主机端口暴露范围

---

## 🗺 Roadmap（建议）

- [ ] 多集节目合集 / 订阅导出（RSS）
- [ ] 更多 ASR / TTS 提供方适配
- [ ] 批量导入与队列并发策略优化
- [ ] 桌面端封装（Tauri）

欢迎通过 Issue / PR 提出想法。

---

## 🤝 贡献

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature`
3. 提交变更：`git commit -m "feat: ..."`
4. 推送分支并开启 Pull Request

提交信息建议遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`feat` / `fix` / `docs` / `refactor` / `chore` …

---

## 📄 License

本项目采用 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [MiMo](https://mimo.mi.com/) — ASR / Chat / TTS 能力参考
- [Fastify](https://fastify.dev/) · [Vite](https://vitejs.dev/) · [React](https://react.dev/) · [ffmpeg](https://ffmpeg.org/)

---

<p align="center">
  <b>BokeBox</b> · 视频进匣，AI 成播<br/>
  <sub>AI 生成口播，人设与音色可自定义</sub>
</p>
