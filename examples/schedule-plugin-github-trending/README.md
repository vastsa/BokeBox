# schedule.github-trending

抓取 [GitHub Trending](https://github.com/trending) 仓库列表，作为定时订阅源。

## 安装

```bash
mkdir -p storage/plugins/schedule
cp -R examples/schedule-plugin-github-trending storage/plugins/schedule/github-trending
```

或 zip 上传到 **设置 → 插件 → 订阅**。

## 配置

插件级（设置页）：

- `since`: daily / weekly / monthly  
- `language`: 如 `typescript`  
- `spokenLanguage`: 如 `zh`

订阅级 `params` 可覆盖上述字段。

## 注意

- 依赖 HTML 结构，GitHub 改版可能导致解析失败  
- 使用宿主 `safeFetch`，受 SSRF 策略约束  
- 建议 `maxItemsPerRun` 设为 1–3，避免每日任务过多
