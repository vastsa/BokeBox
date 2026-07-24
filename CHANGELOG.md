# Changelog

本项目版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.1.1] - 2026-07-24

### Web

- 导航栏现代化：桌面顶栏毛玻璃 + 居中胶囊轨；移动端全宽沉浸底栏，与迷你播放条连续衔接
- 导航 chrome 随滚动切换透明度：顶部更透、滚远略实，贴合内容沉浸感
- 星图页支持亮色主题：日间深空场景、HUD/面板/导航 chrome 与 three.js 背景随 `data-theme` 切换
- 星图亮色对比修复：右下角「点亮一颗星」等 HUD 芯片改用日间实玻璃；标签/星体在亮底可读
- 星图顶栏与天穹色带溶合：去掉过饱和毛玻璃色偏，菜单与背景过渡更顺
- 星图性能优化：降低点云/连线规模，限制约 30–40fps，默认关闭自动旋转与高开销 CSS 动画
- 星图性能：降点云/限热门标签挂载/关自动旋转/限帧；回退不稳定的按需渲染与 HTML 投影改造，恢复可用 CSS2D 路径；空闲停止 rAF（交互再 wake）
- 页面级 SEO：路由独立 title/description；播放/专辑用内容标题与封面；管理页 noindex
- 前端路由改为 **History 模式**，去掉 URL 中的 `#`；兼容旧 hash 链接自动迁移
- 全局 SEO 增强：canonical / Open Graph / Twitter Card / robots；路由切换同步 `og:url`
- 服务端 SPA 伪静态回退收紧：带扩展名的静态资源 404 不再误回退 HTML

### 文档

- 部署 / FAQ / 功能清单同步 History 路由与 SEO 说明
- 设计 Token：星图亮色 HUD 芯片使用 `--tc-chip-*` / `--tc-ink*` 约定

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

