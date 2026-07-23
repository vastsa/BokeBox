# Schedule 订阅插件开发规范

> 适用于 BokeBox 外部定时订阅插件（`storage/plugins/schedule/*`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 宿主 API 版本：`apiVersion = 1`

系统总览与定时订阅能力见设置页 **订阅 / 插件**。可运行示例：

- [examples/schedule-plugin-echo](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-echo)
- [examples/schedule-plugin-github-trending](https://github.com/vastsa/BokeBox/tree/main/examples/schedule-plugin-github-trending)

---

## 1. 设计原则

1. **插件只负责「产出候选条目」**  
   不要创建 Job、不要写 SQLite、不要自己调度。宿主负责：
   - 去重（`schedule_seen_items`）
   - 每轮限流（`maxItemsPerRun`）
   - 创建任务并跑 pipeline
   - cron 调度

2. **统一条目结构**  
   每条候选必须是可访问的 `https?` URL + 稳定 `key`（用于去重）。

3. **默认关闭、最小权限**  
   `riskLevel: high` 时宿主强制 `defaultEnabled = false`。  
   需要出站网络时声明 `permissions: ["network"]`，并优先使用宿主注入的 `ctx.safeFetch`。

4. **可热插拔**  
   放入 `storage/plugins/schedule/<dir>/` 或 zip 上传后，设置页「重新扫描」即可。

---

## 2. 目录与安装

```text
storage/plugins/schedule/<plugin-dir>/
  plugin.json     # 必填
  index.js        # 必填 ESM 入口（或 entry 指定）
  README.md       # 推荐
  node_modules/   # 可选
```

### 复制安装

```bash
mkdir -p storage/plugins/schedule
cp -R examples/schedule-plugin-echo storage/plugins/schedule/echo
```

### Zip 上传

```bash
cd examples/schedule-plugin-echo
zip -r ../schedule-echo.zip plugin.json index.js README.md
```

在 **设置 → 插件 → 订阅** 上传 zip（覆盖安装默认开启）。

---

## 3. plugin.json

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 全局唯一，建议 `schedule.<name>`，`[a-zA-Z0-9._-]` |
| `name` | string | 是 | 展示名 |
| `version` | string | 是 | 语义化版本 |
| `entry` | string | 是 | 相对路径 ESM 入口，禁止 `..` |
| `apiVersion` | number | 是 | 必须为 `1` |
| `description` | string | 否 | 说明 |
| `riskLevel` | `low\|medium\|high` | 否 | 默认 `high` |
| `capabilities` | string[] | 否 | `poll` / `rss` / `list` / `api` |
| `defaultEnabled` | boolean | 否 | 默认 `false`；high 强制 false |
| `permissions` | string[] | 否 | `network` / `config` / `fs:job-dir` / `process:spawn` / `cookies` |
| `configSchema` | array | 否 | 后台配置表单（与 Source 插件相同结构） |

### 示例

```json
{
  "id": "schedule.my-feed",
  "name": "My Feed",
  "version": "0.1.0",
  "entry": "index.js",
  "apiVersion": 1,
  "description": "自定义榜单/接口轮询",
  "riskLevel": "medium",
  "capabilities": ["poll", "api"],
  "defaultEnabled": false,
  "permissions": ["network", "config"],
  "configSchema": [
    {
      "key": "token",
      "label": "API Token",
      "type": "password",
      "required": false
    }
  ]
}
```

---

## 4. 运行时接口（TypeScript 形状）

入口 ESM 导出其一：`default` | `plugin` | `createPlugin()`。

```ts
interface ScheduleItemCandidate {
  /** 去重键：务必稳定。推荐 source 内唯一 id */
  key: string;
  /** 将作为 Job 的 sourceUrl 进入成播流水线 */
  url: string;
  title?: string;
  publishedAt?: string | null;
  summary?: string;
}

interface SchedulePluginFetchInput {
  /** 订阅级参数 + feedUrl/urls 等 */
  params: Record<string, unknown>;
  /** 宿主建议上限 */
  maxItems: number;
  timezone: string;
}

interface SchedulePluginContext {
  scheduleId: string;
  scheduleName: string;
  storageDir: string;
  pluginDir?: string;
  signal?: AbortSignal;
  config: Record<string, string | number | boolean>;
  getConfig(key: string): string | number | boolean | undefined;
  /** 已做 SSRF 校验的安全 fetch */
  safeFetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response>;
}

interface SchedulePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: 'low' | 'medium' | 'high';
  capabilities: Array<'poll' | 'rss' | 'list' | 'api'>;
  defaultEnabled: boolean;
  configSchema?: /* 同 plugin-kit 字段 */ unknown[];

  isAvailable(ctx?: Pick<SchedulePluginContext, 'config' | 'getConfig'>): boolean;
  canHandle(input: SchedulePluginFetchInput, ctx: SchedulePluginContext): boolean;
  fetch(
    input: SchedulePluginFetchInput,
    ctx: SchedulePluginContext,
  ): Promise<{
    items: ScheduleItemCandidate[];
    strategy?: string;
    rawMeta?: Record<string, unknown>;
  }>;
}
```

### 方法语义

| 方法 | 时机 | 要求 |
|------|------|------|
| `isAvailable` | 列表展示 / 执行前 | 配置不齐返回 false |
| `canHandle` | 执行前 | 参数不合法返回 false |
| `fetch` | 调度触发 / 立即执行 | 只返回条目；可抛错 |

### 去重 key 建议

- 稳定内容 id：`guid:xxx` / `gh-trend:owner/repo`
- 避免用「每次变化的时间戳」当 key（除非你就是要每次都建新任务，如 echo 演示）

---

## 5. 与订阅（Schedule）的关系

创建订阅时：

```json
{
  "name": "GH 日报",
  "kind": "plugin",
  "sourceConfig": {
    "pluginId": "schedule.github-trending",
    "params": { "since": "daily", "language": "typescript" }
  },
  "preset": "daily",
  "timezone": "Asia/Shanghai",
  "limits": { "maxItemsPerRun": 3, "onlyNew": true }
}
```

内置兼容：

| kind | 映射插件 |
|------|----------|
| `rss` | `schedule.rss` |
| `url_list` | `schedule.url-list` |
| `plugin` | `sourceConfig.pluginId` |

执行流：

```text
cron/立即执行
  → plugin.fetch(params)
  → 过滤非法 URL
  → onlyNew 去重
  → 截断 maxItemsPerRun
  → createJob(sourceUrl=item.url)
  → pipeline
```

---

## 6. 管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedule-plugins` | 列表 |
| POST | `/api/schedule-plugins/rescan` | 热扫描 |
| POST | `/api/schedule-plugins/install` | 上传 zip（字段 `file`） |
| DELETE | `/api/schedule-plugins/:id/package` | 卸载目录 |
| PATCH | `/api/schedule-plugins/:id` | `{ "enabled": true }` |
| POST | `/api/schedule-plugins/:id/reset` | 恢复 defaultEnabled |
| PUT | `/api/schedule-plugins/:id/config` | `{ "config": { ... } }` |
| POST | `/api/schedule-plugins/:id/config/reset` | 清空配置 |

均需登录。

---

## 7. 安全与合规

1. **优先 `ctx.safeFetch`**，禁止无校验地请求内网 / metadata。  
2. 不要在插件里执行任意 shell（除非明确声明 `process:spawn` 且用户知情）。  
3. 密钥放 `configSchema` 的 `password` 字段，不要写进仓库。  
4. 仅抓取你有权使用的公开内容；频率自重，配合 `maxItemsPerRun`。  
5. `fetch` 抛错时：本轮记失败；`onlyNew` 下毒条目会被标记 seen，避免刷爆额度（可用「立即执行 + force」再试，视宿主实现而定）。

---

## 8. 最小可运行模板

```js
export default {
  id: 'schedule.hello',
  name: 'Hello',
  description: 'minimal',
  version: '0.1.0',
  riskLevel: 'low',
  capabilities: ['poll'],
  defaultEnabled: false,
  isAvailable() { return true; },
  canHandle() { return true; },
  async fetch(input, ctx) {
    return {
      items: [
        {
          key: 'hello:1',
          url: 'https://example.com/hello',
          title: 'Hello from schedule plugin',
        },
      ],
      strategy: 'hello',
    };
  },
};
```

对应 `plugin.json` 的 `id` / `version` / `entry` / `apiVersion` 必须齐全。

---

## 9. 调试清单

1. 设置 → 插件 → 订阅 → 重新扫描，确认无 `loadError`  
2. 启用插件，填配置（如 token）  
3. 设置 → 订阅 → 新建 `kind=plugin`，选中该插件  
4. **立即执行**，查看新建任务数与制作台队列  
5. 服务端日志：`[schedule] run ...` / `[schedule] external plugins loaded=...`

---

## 10. 版本兼容

- 当前仅 `apiVersion = 1`  
- 宿主升级若 bump API，会拒绝加载不匹配插件并在列表显示 `loadError`  
- 请在 README 写明最低 BokeBox 版本与测试过的环境
