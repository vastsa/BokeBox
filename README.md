# Person Boke · 私人视频转播客

个人向平台：后台管理视频→音频→转写→播客全链路资产；前台专注听播与进度记录。

## 双端

- **前台听播** `#/listen`：高级听播厅、继续收听、收听记录、沉浸播放器
- **后台管理** `#/admin`：任务库、发布/管理详情
- **上传视频** `#/admin/upload`：选择 TTS 模式并上传
- **任务详情** `#/admin/jobs/:id`：四段资产预览、重合成 TTS

## 流水线

```
上传视频
  → 提取音频
  → MiMo ASR 转写
  → MiMo 总结播客脚本
  → MiMo TTS 合成播客音频
  → 发布到听播前台
```

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

### Docker Compose

```bash
cp .env.example .env   # 填写 API Key
docker compose up -d --build
```

- 镜像内由 Fastify 同时提供 API + 前端静态资源
- `./storage` 挂载持久化 SQLite 与媒体文件
- 健康检查：`GET /api/health`
