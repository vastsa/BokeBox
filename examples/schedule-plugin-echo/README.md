# schedule.echo · 订阅插件示例

演示 BokeBox **Schedule 插件**契约：实现 `isAvailable` / `canHandle` / `fetch`，由宿主去重并创建任务。

## 安装

```bash
# 方式 A：复制目录
mkdir -p storage/plugins/schedule
cp -R examples/schedule-plugin-echo storage/plugins/schedule/echo

# 方式 B：打包 zip 后在设置页上传
cd examples/schedule-plugin-echo
zip -r ../schedule-plugin-echo.zip plugin.json index.js README.md
```

然后在 **设置 → 插件 → 订阅** 中「重新扫描」并启用。

## 创建订阅

- 类型：`插件`
- 插件：`schedule.echo`
- 可选参数（订阅 params JSON）：`{ "count": 1, "baseUrl": "https://example.com/x" }`

## 契约摘要

见仓库文档：`docs/schedule-plugin-development.md`
