# source.echo 示例插件

用于验证 BokeBox Source 插件热加载，不发起真实网络请求。

完整开发规范见：  
[docs/development/source-plugin.md](../../docs/development/source-plugin.md)

## 安装

```bash
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo
```

在 **设置 → 内容源** 点击「重新扫描」并启用，或：

```bash
curl -X POST http://localhost:8787/api/source-plugins/rescan
curl -X PATCH http://localhost:8787/api/source-plugins/source.echo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

## 触发

创建 URL 任务时使用：

```text
echo:这是一段演示正文
```
