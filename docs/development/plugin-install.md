---
description: 安装、扫描、启停与配置 BokeBox 外部插件。
---

# 插件安装与管理

面向 **使用者** 与 **插件作者联调**。契约细节见各开发规范；产品背景见 [插件体系](../plugins/)。

## 目录约定

```text
storage/plugins/
  source/<dir>/     plugin.json + 入口 ESM
  asr/<dir>/
  tts/<dir>/
  schedule/<dir>/
```

- `storage/plugins/**` 默认 **不入库**（本机放置）  
- 每个插件一个目录；清单文件 `plugin.json` 必填  

## 安装方式

### 1. 复制示例 / 本地目录

```bash
mkdir -p storage/plugins/source
cp -R /path/to/my-plugin storage/plugins/source/my-plugin
```

### 2. 设置页上传 zip

**设置 → 插件** → 对应类型 → 上传安装（若版本提供该按钮）。

### 3. 重新扫描

- UI：设置页 **重新扫描**  
- API：`POST /api/{source|asr|tts|schedule}-plugins/rescan`

## 启停与配置

| 操作 | API（Source 示例） |
| --- | --- |
| 列表 | `GET /api/source-plugins` |
| 启停 | `PATCH /api/source-plugins/:id` body `{"enabled":true}` |
| 恢复默认启停 | `POST /api/source-plugins/:id/reset` |
| 保存配置 | `PUT /api/source-plugins/:id/config` body `{"config":{...}}` |
| 清空配置 | `POST /api/source-plugins/:id/config/reset` |

TTS / ASR / Schedule 将前缀换成对应路径即可。

`configSchema` 定义的表单项会出现在设置页；密钥类字段类型一般为 `password`。

## 风险等级

- `riskLevel: "high"` → 宿主强制默认 **关闭**，需手动启用  
- 仅处理你有权使用的内容；合规模块由使用者负责  

## 卸载

- 删除 `storage/plugins/<kind>/<dir>/` 后重新扫描  
- 或使用设置页卸载（若提供 `DELETE .../package` 类接口，Schedule 等已支持）  

## 联调检查单

1. `plugin.json` 的 `id` / `apiVersion` / `entry` 正确  
2. 入口为 ESM，能被 Node 加载  
3. rescan 后出现在列表  
4. 启用后创建任务 / 跑订阅能命中  
5. 错误信息能在任务详情或 server 日志看到  

## 相关

- [示例插件目录](./examples.md)
- [Source 开发](./source-plugin.md)
- [TTS 开发](./tts-plugin.md)
- [Schedule 开发](./schedule-plugin.md)
