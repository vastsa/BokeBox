# services 结构

```text
services/
  settings/     全局设置（KV / 站点 / 账号会话 / AI / 提示词）
  import/       URL 与本地素材导入
  job/          任务存储与流水线（导航出口）
  media/        音视频 / ASR / TTS / 封面（导航出口）
  content/      口播稿 / 闪卡 / 博客 / 提示词（导航出口）
  album/        专辑（导航出口）
  auth/         认证（导航出口）
  mcp/          MCP 协议与工具（导航出口）
  *.ts          兼容入口与尚未迁入子域的实现文件
```

新代码优先从子域 `index` 导入；根级 `settingsStore.ts` / `urlImporter.ts` 仅作兼容门面。
