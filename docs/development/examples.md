---
description: BokeBox 仓库内插件示例一览与安装方式。
---

# 示例插件目录

仓库 [`examples/`](https://github.com/vastsa/BokeBox/tree/main/examples) 提供可复制安装的最小插件，用于验证热加载与契约。

## 一览

| 目录 | 类型 | id（典型） | 说明 |
| --- | --- | --- | --- |
| [source-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/source-plugin-echo) | Source | `source.echo` | 把 `echo:正文` 变成文本 artifact，可配 token/前缀 |
| [asr-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/asr-plugin-echo) | ASR | 见 plugin.json | 演示用转写桩 |
| [tts-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-echo) | TTS | 见 plugin.json | 演示用合成桩 / 预置网格 |
| [tts-plugin-fishspeech](https://github.com/vastsa/BokeBox/tree/main/examples/tts-plugin-fishspeech) | TTS | `tts.fishspeech` | Fish Audio 云端或自托管 Fish Speech |
| [schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo) | Schedule | 见 plugin.json | 演示候选条目 |
| [schedule-plugin-github-trending](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending) | Schedule | 见 plugin.json | GitHub Trending 候选 |

具体 `id` / `configSchema` 以各目录 `plugin.json` 为准。

## 通用安装

在 **BokeBox 仓库根目录**：

```bash
# Source
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo

# TTS（Fish Speech）
mkdir -p storage/plugins/tts
cp -R examples/tts-plugin-fishspeech storage/plugins/tts/fishspeech

# Schedule
mkdir -p storage/plugins/schedule
cp -R examples/schedule-plugin-github-trending storage/plugins/schedule/github-trending
```

然后：

1. 打开 **设置 → 插件**（对应 Source / ASR / TTS / Schedule 分区）  
2. 点击 **重新扫描**  
3. 启用插件并填写配置（若有）  

或 API：

```bash
curl -s -X POST http://localhost:8787/api/source-plugins/rescan
curl -s -X PATCH http://localhost:8787/api/source-plugins/source.echo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

（将路径前缀换成 `asr-plugins` / `tts-plugins` / `schedule-plugins`。）

也支持在设置页 **上传 zip** 安装（以当前 UI 为准）。

## source.echo 快速试

启用后，创建 URL 任务时使用：

```text
echo:这是一段演示正文
```

用于验证插件匹配与流水线，不发起真实外网抓取。

## tts.fishspeech 要点

| 字段 | 说明 |
| --- | --- |
| `baseUrl` | 云端 `https://api.fish.audio`；自托管如 `http://127.0.0.1:8080` |
| `apiKey` | 云端必填 |
| `model` | 云端模型头，如 `s2.1-pro-free` |
| `referenceId` | 默认音色 id（强烈建议） |
| `format` | 推荐 `wav` |

完整说明见示例内 README。

## 开发规范

- [Source 开发](./source-plugin.md)
- [TTS 开发](./tts-plugin.md)
- [Schedule 开发](./schedule-plugin.md)
- [插件安装与管理](./plugin-install.md)
