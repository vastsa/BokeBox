# source.echo 示例插件

用于验证 BokeBox Source 插件热加载，不发起真实网络请求。

## 安装

```bash
mkdir -p storage/plugins/source
cp -R examples/source-plugin-echo storage/plugins/source/echo
```

## 加载 / 启用

```bash
# 需已登录的会话 cookie，或在本机管理接口调用
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

仅当插件已启用时，才会匹配 `echo:` 前缀（否则仍走 direct-http，可能失败）。
