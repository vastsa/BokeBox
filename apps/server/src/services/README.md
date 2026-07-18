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
  storageMigrator.ts  存储布局迁移（启动期）
```

## 约定

1. **只从子域导入**：`./job/index.js`、`./settings/index.js`、`./media/coverGenerator.js`
2. 根级不再保留兼容门面；跨子域请引用对方子域路径
3. 新增业务代码按子域落文件，避免再回到扁平 `services/*.ts`

4. **实体读缓存**：`job` / `album` / `listen` / `settings` 的按 id 读取走 `utils/memoryCache` 命名缓存；写路径必须回填或失效对应 key，禁止旁路改库后不失效

