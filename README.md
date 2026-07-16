# Person Boke · 私人视频转播客

个人向平台：后台管理视频→音频→转写→播客全链路资产；前台专注听播与进度记录。

## 单一用户端

首次打开会进入 **系统初始化**：设置用户名密码、API Key 与模型参数。

- **首页** `#/home`：播客库 + 制作中任务
- **制作** `#/create`：上传视频/链接，配置人设与音色
- **任务详情** `#/jobs/:id`：流水线资产、重合成、播放
- **播放页** `#/play/:id`：沉浸听播
- **设置** `#/settings`：账号、API Key、模型

旧路径 `#/listen`、`#/admin/*` 仍可兼容跳转。

## 流水线

```
上传视频
  → 提取音频
  → MiMo ASR 转写
  → MiMo 总结播客脚本
  → 并发：
      · 图片模型生成封面（若已配置 imageModel）
      · 知识闪卡
      · MiMo TTS 合成播客音频
  → 发布到听播前台
```

## 口播人设（脚本提示词干预）

上传时可选：

- **使用全局**：读取后台保存的默认人设（任务创建时快照）
- **本次单独设置**：仅对本任务生效

可配置项：主播称呼、身份角色、节目名、说话风格、目标听众、语气调性、开场/收尾偏好、额外要求。

API：

- `GET /api/settings/script-prompt`
- `PUT /api/settings/script-prompt`

## TTS 模式（对齐 MiMo 文档）

| 模式 | 模型 | 说明 |
|------|------|------|
| default | mimo-v2.5-tts | 自然口播 · 预置音色 · **音频标签控制** |
| voicedesign | mimo-v2.5-tts-voicedesign | 文字描述定制音色（不支持预置音色/音频标签） |

### 自然口播（音频标签控制）

文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5

- **不支持** user 侧「风格指令」
- 语气控制只靠 **assistant 文本内的音频标签**
- 开头风格标签：`(磁性)` `(沉稳 温柔)` `(慵懒)` …
- 正文细粒度标签：`（深呼吸）` `（轻笑）` `（沉默片刻）` `（语速加快）` …
- 生成口播稿时，LLM 会自动写入上述标签

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    {
      "role": "assistant",
      "content": "(磁性 沉稳)大家好，欢迎收听。（深呼吸）先说结论……（轻笑）我们下期见。"
    }
  ],
  "audio": {
    "format": "wav",
    "voice": "冰糖"
  }
}
```

### 预置精品音色

| 音色名 | Voice ID | 语言 | 性别 |
|--------|----------|------|------|
| MiMo-默认 | mimo_default | 自适应 | - |
| 冰糖 | 冰糖 | 中文 | 女性 |
| 茉莉 | 茉莉 | 中文 | 女性 |
| 苏打 | 苏打 | 中文 | 男性 |
| 白桦 | 白桦 | 中文 | 男性 |
| Mia | Mia | 英文 | 女性 |
| Chloe | Chloe | 英文 | 女性 |
| Milo | Milo | 英文 | 男性 |
| Dean | Dean | 英文 | 男性 |

默认音色：`冰糖`（可用 `OPENAI_TTS_DEFAULT_VOICE` 覆盖）

## 存储

任务与收听进度使用 **SQLite**（`storage/app.db`）。

媒体文件按任务聚合，不再按类型摊开：

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
- 迁移成功后原 JSON 会重命名为 `*.migrated`
- 旧版 `uploads/audio/transcripts/podcasts` 摊开布局会在启动时自动迁入 `jobs/{id}/`

## 启动

### 一键启动（推荐）

```bash
# 本地开发（前后端热更新）
./start.sh

# 本地生产（构建后单端口托管）
./start.sh prod

# Docker Compose
./start.sh docker
./start.sh docker:down
```

等价 npm scripts：`pnpm start:app` / `pnpm start:prod` / `pnpm docker:up`

### 手动启动

```bash
pnpm install
pnpm dev
```

| 模式 | 地址 |
|------|------|
| 开发前端 | http://localhost:5173 |
| 开发后端 | http://localhost:8787 |
| 生产 / Docker | http://localhost:8787 |

配置见根目录 `.env`（`OPENAI_BASE_URL` / `OPENAI_API_KEY` / 模型名）。

可选：设置页或 `OPENAI_IMAGE_MODEL` 配置图片模型后，生成播客脚本时会自动调用 `/images/generations` 生成封面。

### Docker Compose

```bash
cp .env.example .env   # 填写 API Key
docker compose up -d --build
# 或: ./start.sh docker
```

- 镜像内由 Fastify 同时提供 API + 前端静态资源
- `./storage` 挂载持久化 SQLite 与媒体文件
- 健康检查：`GET /api/health`

### Docker CI/CD（GitHub Actions + GHCR）

推送到 `main` 或打 `v*` tag 会自动构建多架构镜像并推送到 GHCR：

```text
ghcr.io/<owner>/person-boke:latest
ghcr.io/<owner>/person-boke:sha-<short>
ghcr.io/<owner>/person-boke:1.0.0   # 来自 git tag v1.0.0
```

生产机拉取（无需在服务器 build）：

```bash
# 准备 docker-compose.prod.yml + .env + storage/
export GHCR_IMAGE=ghcr.io/vastsa/person-boke
export IMAGE_TAG=latest
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

可选 SSH 自动部署、secrets 列表见 [docs/ci-cd.md](docs/ci-cd.md)。
