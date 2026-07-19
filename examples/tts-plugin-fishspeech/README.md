# tts.fishspeech · Fish Speech / Fish Audio

将 [Fish Audio](https://fish.audio/) 云端 API，或自托管 [Fish Speech](https://github.com/fishaudio/fish-speech)（OpenAudio）接入 BokeBox 作为 TTS 提供方。

- 插件 id：`tts.fishspeech`
- 协议：LGPL-3.0（宿主仓库）
- 仓库：https://github.com/vastsa/BokeBox

## 能力

| 项 | 说明 |
|----|------|
| 云端 | `POST https://api.fish.audio/v1/tts` + `Authorization` + `model` header |
| 自托管 | `POST {baseUrl}/v1/tts`，与官方 `tools/api_client.py` 一致 |
| 音色 | `reference_id`（云端音色模型 id / 本地 reference 名） |
| 输出 | 默认 WAV，便于多段口播拼接 |

## 安装

```bash
# 在 BokeBox 项目根目录
mkdir -p storage/plugins/tts
cp -R examples/tts-plugin-fishspeech storage/plugins/tts/fishspeech
```

设置页：**设置 → 插件 → 语音合成 → 重新扫描**，或：

```bash
curl -X POST http://localhost:8787/api/tts-plugins/rescan
```

## 配置

| 字段 | 说明 |
|------|------|
| `baseUrl` | 云端 `https://api.fish.audio`；自托管如 `http://127.0.0.1:8080` |
| `apiKey` | 云端必填；自托管未开鉴权可空 |
| `model` | 云端请求头：`s2.1-pro-free` / `s2.1-pro` / `s2-pro` / `s1` |
| `referenceId` | 默认音色 id（强烈建议填写） |
| `format` | 推荐 `wav` |
| `temperature` / `topP` / `chunkLength` / `latency` / `normalize` | 合成参数 |

保存后启用插件，并在 **设置 → AI 服务** 将 `ttsProvider` 设为 `tts.fishspeech`（插件页「设为当前」亦可）。

### 云端示例

```bash
curl -X PUT http://localhost:8787/api/tts-plugins/tts.fishspeech/config \
  -H 'Content-Type: application/json' \
  -d '{
    "config": {
      "baseUrl": "https://api.fish.audio",
      "apiKey": "YOUR_FISH_API_KEY",
      "model": "s2.1-pro-free",
      "referenceId": "YOUR_VOICE_MODEL_ID",
      "format": "wav"
    }
  }'

curl -X PATCH http://localhost:8787/api/tts-plugins/tts.fishspeech \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

### 自托管示例

```bash
# 假设本机已启动 Fish Speech API：http://127.0.0.1:8080
curl -X PUT http://localhost:8787/api/tts-plugins/tts.fishspeech/config \
  -H 'Content-Type: application/json' \
  -d '{
    "config": {
      "baseUrl": "http://127.0.0.1:8080",
      "apiKey": "",
      "referenceId": "my-speaker",
      "format": "wav"
    }
  }'
```

Docker 访问宿主机服务时，可将 baseUrl 写成 `http://host.docker.internal:8080`。

## 音色 UI

插件声明 `meta.voiceUi = "reference"`。宿主音色面板会切换为 **reference_id 输入**，而不是 MiMo/Edge 预置音色网格：

- 任务级 `tts.voice` = 覆盖用 reference_id
- 留空 = 使用插件配置 `referenceId`
- 设置页展示「当前生效 / 插件默认」与一键填入

## 音色从哪来

1. **Fish Audio 音色库 / 自克隆模型**：控制台复制 model id → 填 `referenceId`
2. **任务级覆盖**：制作时音色框粘贴模型 id（会覆盖插件默认；其它内置提供方的「冰糖 / alloy」等名会被忽略）
3. **自托管 reference**：按 Fish Speech 文档放置 reference 音频目录，id 用目录名

## 注意

- 首次使用云端请在 [Fish Audio](https://fish.audio/) 创建 API Key
- 自托管需自行部署与显存；插件只负责 HTTP 调用
- 长口播由宿主按 `maxCharsPerRequest`（800）切段后多次调用再拼接
- Key 勿提交到仓库；`storage/plugins/**` 默认 gitignore

## 相关链接

- API：https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
- 自托管：https://github.com/fishaudio/fish-speech
- 宿主 TTS 插件说明：`docs/asr-tts-plugins.md`
