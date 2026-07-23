# asr.echo 示例插件

演示外部 ASR 插件热加载：返回固定转写文本，可读配置 `prefix`。

开发规范： [docs/development/asr-plugin.md](../../docs/development/asr-plugin.md)

## 安装

```bash
mkdir -p storage/plugins/asr
cp -R examples/asr-plugin-echo storage/plugins/asr/echo
curl -X POST http://localhost:8787/api/asr-plugins/rescan
```

在 **设置 → 插件 → 语音转写** 启用，并设为当前 `asrProvider`。
