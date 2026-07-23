# Changelog

本项目版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-07-23

### 定时订阅（Schedule）

- 新增完整定时订阅能力：RSS / Atom、URL 列表、GitHub Trending、Hacker News
- 订阅统一为 **插件 + 参数 + cron** 模型，支持外部 Schedule 插件 zip 安装
- 参数表单按插件 `configSchema` 动态渲染；无覆盖项时不写入空 `params`
- 支持指定内容采集 **Source 插件**（默认自动匹配）
- 去重限流、立即执行 / 强制执行、运行记录（错误 / 耗时 / Job 跳转）
- MCP：`list_schedules` / `get_schedule` / `create_schedule` / `run_schedule_now` / `list_schedule_plugins`
- 调度契约加固：启动预占 `next_run`、失败可重试、插件停用跳过热循环

### TTS

- MiMo TTS 新增 **音色克隆**（`voiceclone` / `mimo-v2.5-tts-voiceclone`）
- 支持参考音频路径或 data URI；多段口播复用参考音频缓存

### 文档与站点

- 引入 VitePress 文档站（中英），部署至 Vercel
- README / 使用指南同步订阅、流水线、MCP、插件开发说明
- 补全 ASR 插件开发规范与示例索引

### Web

- 任务详情页信息层级与布局优化
- 设置页 UI 细节（hint 尺寸等）

### 其它

- 默认 AI Base URL 调整为 `api.xiaomimimo.com`
- Docker 运行镜像精简，降低供应链 CVE 面
- CI：固定 Node 22，文档仅走 Vercel

## [1.0.0] - 此前

首个正式版本：私人 AI 播客工作室核心能力（导入、流水线、听播、MCP、Source/ASR/TTS 插件）。

