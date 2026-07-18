# services 结构

```text
services/
  settings/     全局设置（KV / 站点 / 账号会话 / AI / 提示词）
  import/       URL 与本地素材导入
  job/          任务存储、流水线、听播进度、脚本时间轴
  media/        音视频提取、ASR、TTS、封面与图片优化
  content/      口播稿、闪卡、提示词模板
  album/        专辑
  auth/         登录 / 初始化 / 改密
  mcp/          MCP 协议、Token、工具
  *.ts          根级兼容门面（re-export），旧 import 路径仍可用
  storageMigrator.ts  存储布局迁移（启动期）
```

## 约定

1. **新代码**优先从子域导入：`./job/index.js`、`./settings/index.js`
2. **根级 `jobStore.ts` 等**仅作兼容门面，不再放实现
3. 跨子域依赖可通过根门面或对方 `index`；避免子域实现互相深链私有文件
