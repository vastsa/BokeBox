# Web 设计 Token 规范（字号 · 颜色）

> 适用于 BokeBox Web 前端（`apps/web`）  
> 仓库：<https://github.com/vastsa/BokeBox>  
> 协议：LGPL-3.0  
> 源码真源：[`apps/web/src/styles/index.css`](https://github.com/vastsa/BokeBox/blob/main/apps/web/src/styles/index.css) 的 `:root` / `html[data-theme="dark"]`

本文约定 **字号、文字色、语义色** 如何使用 design token。  
目标：跨页面视觉一致，禁止在业务样式里写死 `px` 字号与 `#hex` / `rgb()` 文字色。

---

## 1. 设计原则

1. **Token First**  
   字号、文字色、状态色一律 `var(--token)`。不在组件里写 `font-size: 12px`、`color: #5b6575`。

2. **语义优先，数值其次**  
   先选「这是什么角色」（主文案 / 次级 / 辅助 / 危险），再选 token。  
   不要按「看起来差不多的 px」随手挑一个。

3. **亮暗主题自动跟随**  
   通用色（`--text` / `--brand` / `--surface` …）在 `html[data-theme="dark"]` 已有覆盖。  
   业务代码只引用语义 token，不要为暗色再写一套硬编码 hex。

4. **固定暗底场景用 On-ink**  
   标签宇宙、深色 HUD 等 **不随主题反转的暗底 UI**，使用 `--text-on-ink*` / `--brand-on-ink*`，  
   不要误用 `--text`（亮色主题下是深色字）。

5. **单源真源**  
   只在 `index.css` 的 `:root` 增删 token。页面 / 组件禁止私自 `const color = '#xxx'` 当样式源。

6. **Tailwind 任意值也要走 token**  
   允许 `text-[var(--fs-md)]`、`text-[var(--text-2)]`，禁止 `text-[13px]`、`text-[#5b6575]`。

---

## 2. 快速对照（最常用）

### 2.1 字号怎么选

| 场景 | Token | 值 |
|------|-------|----|
| 极小角标 / 封面缩略字 | `--fs-2xs` ~ `--fs-xs` | 9–10px |
| 底栏标签、弱提示 | `--fs-xs-plus` ~ `--fs-sm` | 10.5–11px |
| 辅助说明、 meta | `--fs-sm-plus` ~ `--fs-base` | 11.5–12px |
| 次级正文、表单提示 | `--fs-base-plus` ~ `--fs-md` | 12.5–13px |
| **默认 UI 正文（body 基准）** | `--fs-md` | 13px |
| 列表主标题、按钮 | `--fs-md-plus` ~ `--fs-lg` | 13.5–14px |
| 导航品牌名、强调标题 | `--fs-lg-plus` ~ `--fs-xl` | 14.5–15px |
| 区块大标题 | `--fs-2xl` ~ `--fs-3xl` | 16–17px |
| 展示型标题 | `--fs-3xl-plus` ~ `--fs-display` | 18–20px |
| 超大标题 | `--fs-4xl` | 22px |
| 移动端输入框防缩放 | `--fs-2xl` | 16px |

### 2.2 文字色怎么选

| 场景 | Token | 说明 |
|------|-------|------|
| 主文案、标题 | `--text` | 最高对比 |
| 次级文案、图标默认 | `--text-2` | 中对比 |
| 辅助、占位、时间戳 | `--text-3` | 低对比 |
| 弱化/静音 | `--muted` | 接近 text-3，少用 |
| 品牌链接、激活态 | `--brand` / `--brand-2` | 交互强调 |
| 实心品牌按钮上的字 | `--text-inv` / `--brand-contrast` | 白字 |
| 成功 / 警告 / 危险 | `--success` / `--warning` / `--danger` | 状态语义 |
| 固定暗底主字 | `--text-on-ink` | 不随主题反转 |
| 固定暗底辅助字 | `--text-on-ink-3` ~ `--text-on-ink-5` | 层级递减 |

---

## 3. 字号体系（Typography）

### 3.1 固定档位（首选）

定义位置：`:root` → `/* ===== Typography scale ===== */`

| Token | 值 | 典型用途 |
|-------|----|----------|
| `--fs-2xs` | `9px` | 极小标记 |
| `--fs-xs` | `10px` | 角标、密度极高 UI |
| `--fs-xs-plus` | `10.5px` | 底栏 label、极弱说明 |
| `--fs-sm` | `11px` | chip、badge、小标签 |
| `--fs-sm-plus` | `11.5px` | 次级 meta |
| `--fs-base` | `12px` | 辅助正文、副标题 |
| `--fs-base-plus` | `12.5px` | 列表次行、说明 |
| `--fs-md` | `13px` | **全局默认**、按钮、表单 |
| `--fs-md-plus` | `13.5px` | 略强调的正文 |
| `--fs-lg` | `14px` | 卡片标题、重要行 |
| `--fs-lg-plus` | `14.5px` | 顶栏品牌名 |
| `--fs-xl` | `15px` | Section / Empty 标题 |
| `--fs-2xl` | `16px` | 小屏输入框、中标题 |
| `--fs-2xl-plus` | `16.5px` | 播放器曲名等 |
| `--fs-3xl` | `17px` | 页内大标题 |
| `--fs-3xl-plus` | `18px` | 展示标题 |
| `--fs-display` | `20px` | 面板主标题、Hero 数字 |
| `--fs-4xl` | `22px` | 最大固定标题 |
| `--fs-cover-face` | `34%` | 封面字相对容器 |
| `--fs-code-em` | `0.92em` | 行内 code 相对父级 |

> `body` 已设置：`font-size: var(--fs-md); line-height: var(--lh-normal);`  
> 未显式指定字号的节点继承 13px，保证页面基线一致。

### 3.2 字重 / 行高 / 字距

| 类型 | Token | 值 |
|------|-------|----|
| 字重 | `--fw-medium` | `550` |
| | `--fw-semibold` | `600` |
| | `--fw-bold` | `650` |
| | `--fw-extrabold` | `700` |
| | `--fw-black` | `800` |
| 行高 | `--lh-tight` | `1.25` |
| | `--lh-snug` | `1.45` |
| | `--lh-normal` | `1.5` |
| | `--lh-relaxed` | `1.55` |
| | `--lh-loose` | `1.7` |
| | `--lh-prose` | `1.8` |
| 字距 | `--tracking-tighter` | `-0.04em` |
| | `--tracking-tight` | `-0.03em` |
| | `--tracking-snug` | `-0.02em` |
| | `--tracking-normal` | `-0.01em` |
| | `--tracking-wide` | `0.01em` |
| | `--tracking-label` / `--tracking-caps` 等 | 标签、大写专用 |

**字重约定：** 新代码优先 `font-weight: var(--fw-*)`。  
若需要表中没有的中间值（如 `750`），先讨论是否值得加 token，禁止长期散落魔法数。

### 3.3 流体字号与正文（Prose）

仅用于 **响应式标题 / 长文排版**，日常列表与表单不要用。

| 前缀 | 用途 |
|------|------|
| `--fs-fluid-*` | 随视口缩放的标题/展示字 |
| `--fs-prose-h1/h2/h3` | `.prose-soft` 标题 |
| `--fs-prose-md/sm/code` | 正文与行内代码 |

优先用固定档位；只有在 Hero、歌词焦点、大标题需要随屏宽变化时才用 `fluid`。

### 3.4 字体栈

```css
@theme {
  --font-sans: "Inter", "Noto Sans SC", ui-sans-serif, system-ui,
    -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif;
}
```

`body { font-family: var(--font-sans); }`  
不要在业务组件再写一套系统字体列表。

---

## 4. 颜色体系（Color）

### 4.1 文本色（通用，随主题）

| Token | Light（示意） | 用途 |
|-------|---------------|------|
| `--text` | `#141a24` | 主文字 |
| `--text-2` | `#5b6575` | 次级 |
| `--text-3` | `#8b95a7` | 辅助 |
| `--text-inv` | `#ffffff` | 深色底/品牌按钮反白 |
| `--brand-contrast` | `#ffffff` | 品牌实心表面对比字 |
| `--muted` | `#8b93a7` | 静音色（少用，优先 text-3） |

Dark 下由 `html[data-theme="dark"]` 覆盖，例如 `--text: #edf2fb`。

### 4.2 品牌色

| Token | 用途 |
|-------|------|
| `--brand` | 主品牌、进度、焦点环 |
| `--brand-2` | 激活文字、强调链接 |
| `--brand-3` | 辅助高光 |
| `--brand-soft` / `--brand-soft-2` | 浅底选中 |
| `--brand-ring` | focus ring |
| `--brand-grad` | 主按钮渐变 |

### 4.3 表面与背景

| Token | 用途 |
|-------|------|
| `--bg` | 页面底 |
| `--surface` | 卡片 / 弹层 |
| `--surface-2` | 次级表面、hover |
| `--surface-3` | 更深一级分组 |
| `--surface-brand` / `--surface-muted` | 品牌浅底、柔和底 |
| `--surface-ink*` / `--surface-deep*` | 播放器等深色表面 |

### 4.4 状态色

| 语义 | 主色 | 浅底 | 深墨（亮底上的深字） | 亮色（暗底上的浅字） |
|------|------|------|----------------------|----------------------|
| 成功 | `--success` | `--success-soft` | `--success-ink` | `--success-bright` |
| 警告 | `--warning` | `--warning-soft` | `--warning-ink` | `--warning-bright` |
| 危险 | `--danger` | `--danger-soft` | `--danger-ink` | `--danger-bright` |

补充：

| Token | 用途 |
|-------|------|
| `--danger-strong` | 错误强调（更深） |
| `--danger-hot` | 热危险 / 删除 hover |

**用法：**

- 普通状态文案：`--success` / `--warning` / `--danger`
- 浅色标签底：`*-soft` + 对应主色文字
- 亮色主题下「深色状态字」：`*-ink`
- 暗色主题覆盖：`html[data-theme="dark"]` 内用 `*-bright`

### 4.5 On-ink（固定暗底）

用于标签云、深色宇宙 HUD 等 **始终暗底** 的界面：

| Token | 用途 |
|-------|------|
| `--text-on-ink` | 主文字 |
| `--text-on-ink-bright` / `--text-on-ink-strong` / `--text-on-ink-title` | 更亮标题 |
| `--text-on-ink-2` … `--text-on-ink-5` | 次级到最弱 |
| `--text-on-ink-soft` | 柔和次级 |
| `--brand-on-ink` / `-2` / `-3` | 暗底品牌字 |
| `--danger-on-ink` | 暗底错误字 |
| `--text-on-ink-a88` | 半透明主字 |

### 4.6 语言色 / 绝对色 / 分隔

| Token | 用途 |
|-------|------|
| `--lang-zh` / `--lang-en` | 语言色板（设置项） |
| `--lang-zh-on-dark` / `--lang-en-on-dark` | 暗色主题下语言色 |
| `--white` / `--black` | 绝对白/黑（遮罩、纯色图标） |
| `--separator` / `--separator-strong` / `--separator-soft` | 分割线 |
| `--code-bg` | 行内代码底 |

Alpha 阶梯（`--white-a*` / `--black-a*` / `--night-a*` / `--ink-a*` 等）用于阴影、描边、叠层，**不要拿来当正文色**。

---

## 5. 写法规范

### 5.1 CSS

```css
/* ✅ */
.card-title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-snug);
  letter-spacing: var(--tracking-snug);
  color: var(--text);
}
.card-meta {
  font-size: var(--fs-sm-plus);
  color: var(--text-3);
}
.card-title.is-danger {
  color: var(--danger);
}

/* ❌ */
.card-title {
  font-size: 14px;
  color: #141a24;
}
```

需要半透明时，用已有 soft/alpha token，或：

```css
color: color-mix(in srgb, var(--brand) 70%, transparent);
```

不要新写 `rgba(79, 142, 247, 0.7)` 除非同步提升为 token。

### 5.2 TSX / Tailwind

```tsx
// ✅
<h2 className="text-[var(--fs-xl)] font-semibold tracking-[var(--tracking-snug)] text-[var(--text)]">
  {title}
</h2>
<p className="text-[var(--fs-base)] text-[var(--text-3)]">{subtitle}</p>

// ❌
<h2 className="text-[15px] tracking-[-0.02em] text-[#141a24]">{title}</h2>
```

优先复用已有 CSS 类（如 `.nl-btn`、`.app-page-title`、`.soft-row-title`），避免每个页面重写一套字号。

### 5.3 主题切换

- 入口：`apps/web/src/lib/theme.ts`（偏好 `system` | `light` | `dark`，渲染解析为 `light` | `dark`）
- 挂载：`html[data-theme="..."]` + `color-scheme`
- 业务侧只消费 token，不要 `if (theme === 'dark') color = '#xxx'`

### 5.4 移动端输入框

iOS 在输入框 `font-size < 16px` 时会聚焦缩放。  
设置页小屏已统一：

```css
@media (max-width: 899px) {
  .settings-page input,
  .settings-page textarea,
  .settings-page select {
    font-size: var(--fs-2xl); /* 16px */
  }
}
```

新增全屏表单时同样遵守，使用 `--fs-2xl` 而非写死 `16px`。

---

## 6. 移动端文字密度（防傻大粗）

手机端优先 **克制**：字号降一档、字重少用 black/extrabold，输入框仅在防缩放时用 16px。

### 6.1 规则

| 区域 | 手机端约定 |
|------|------------|
| 页面标题 `.app-page-title` / `.lh-title` | `--fs-3xl` + `--fw-extrabold`（≥768px 升到 `--fs-display`） |
| 底栏 `.bottom-nav-item` | `--fs-xs` + `--fw-medium`（激活 `--fw-semibold`） |
| 顶栏品牌 `.app-brand-title` | `--fs-lg` + `--fw-medium` |
| 设置 Tab / 区块标题 | `--fs-base` ~ `--fs-base-plus` + `--fw-semibold` |
| 设置 label | `--fs-sm-plus` + `--fw-medium` |
| 设置 input/select（≤899px） | **`--fs-2xl`（16px 防 iOS 缩放）** + `--fw-medium` + 高度 `--control-5xl` |
| 通用按钮 `.nl-btn`（≤767px） | `--fs-base-plus` + `--fw-semibold` |

### 6.2 不要做的事

- ❌ 为了「更醒目」在底栏/表单 label 使用 `--fw-black` / `--fw-extrabold`
- ❌ 手机端把输入框再放大到 17px+ 或加粗到 700
- ❌ 用 `text-[15px]` 等硬编码绕过密度约定
- ✅ 需要强调时用颜色（`--brand-2` / `--text`）而不是堆字重

相关实现：

- `apps/web/src/styles/index.css`（`@media (max-width: 767px|899px)` 密度块）
- `apps/web/src/layouts/AppShell.tsx`（底栏 class）

---

## 7. 组件级推荐映射

| UI 角色 | 字号 | 颜色 | 字重 |
|---------|------|------|------|
| 页面大标题 `.app-page-title` | 既有 CSS 类 | `--text` | extrabold/bold |
| 页面副文 | `--fs-base` ~ `--fs-base-plus` | `--text-3` | medium |
| Section 标题 | `--fs-xl` | `--text` | semibold |
| 列表主行 | `--fs-md` ~ `--fs-lg` | `--text` | semibold |
| 列表次行 | `--fs-sm` ~ `--fs-base` | `--text-3` | medium |
| 按钮 `.nl-btn` | `--fs-md` | 随 variant | semibold |
| 顶栏导航 | `--fs-base-plus` | 默认 `--text-2`，激活 `--brand-2` | semibold |
| 底栏导航 | `--fs-xs-plus` | 默认 `--text-3`，激活 `--brand-2` | semibold |
| 表单 label | `--fs-sm-plus` ~ `--fs-base` | `--text-2` | medium/bold |
| 错误提示 | `--fs-base` ~ `--fs-base-plus` | `--danger` | medium |
| Empty 标题 | `--fs-xl` | `--text` | semibold |
| Empty 描述 | `--fs-base-plus` | `--text-3` | regular |

---

## 8. 新增 Token 流程

1. 确认现有档位无法表达（不要为 `13.2px` 这种微调开新档）。  
2. 在 `index.css` 的 `:root` **对应分区注释下**追加，命名遵循：
   - 字号：`--fs-{size}` / `--fs-{size}-plus`
   - 色：`--{role}` / `--{role}-soft` / `--{role}-ink` / `--{role}-bright`
3. 若随主题变化，同步写 `html[data-theme="dark"]` 覆盖。  
4. 在本文档对应表格补一行。  
5. 全仓替换调用点，禁止新旧两套并存。

**命名禁忌：**

- ❌ `--blue-1`、`--gray-3`（无语义）
- ❌ `--title-color-home`（绑定页面）
- ✅ `--text-2`、`--danger-ink`、`--fs-md-plus`

---

## 9. Review 清单（PR 自检）

提交前端样式前勾选：

- [ ] 无新增 `font-size: Npx` / `font-size: Nrem`（token / clamp token 除外）
- [ ] 无新增 `color: #hex` / `color: rgb(...)` 作为文字色
- [ ] TSX 无 `text-[12px]`、`text-[#...]`
- [ ] 字号来自 §3 档位；颜色来自 §4 语义；手机端遵守 §6 密度
- [ ] 暗色模式抽查：主文案 / 次文案 / 危险色可读
- [ ] 固定暗底 UI 使用 On-ink，而非 `--text`
- [ ] 小屏输入框 ≥ `--fs-2xl`（16px）

**快速扫描命令：**

```bash
# 硬编码字号（属性）
rg -n "font-size:\s*[0-9]" apps/web/src/styles/index.css

# 硬编码文字色（属性）
rg -n "(?<![-a-z])color:\s*#|(?<![-a-z])color:\s*rgb" apps/web/src/styles/index.css

# TSX 任意字号
rg -n "text-\[[0-9]" apps/web/src --glob '*.tsx'
```

期望：属性层命中为 0；`:root` 内 token **定义**可以有 hex/px。

---

## 10. 现状 Review 摘要（2026-07）

### 已落地

- 全局 `font-size` / `color` 属性已统一为 token
- TSX 中 `text-[Npx]` 已清零，改为 `text-[var(--fs-*)]` / `text-[var(--text*)]`
- `body` 基准字号 `--fs-md`，跨页继承一致
- 状态 ink/bright、On-ink、语言色已入库

### 已补充

- 手机端文字密度：底栏 / 设置表单 / 页标题已收敛，见 §6

### 已知后续（非阻塞）

| 项 | 说明 |
|----|------|
| 字重魔法数 | 仍有 `font-weight: 700/750/600…` 散落，应逐步改为 `--fw-*` |
| 行高 / 字距 | 部分 `line-height: 1.2`、`letter-spacing: 0.18em` 未完全 token 化 |
| 背景 / 边框 hex | 部分装饰性 `background`/`border-color` 仍直接写 rgba，可按需提升 |
| fluid 命名 | `--fs-fluid-1…18` 偏序号化，新代码优先固定档；长期可语义化重命名 |
| 封面渐变 | `format.ts` 中 Tailwind 渐变类含硬编码色，属装饰预设，与正文色体系分离 |

---

## 11. 相关文件

| 路径 | 说明 |
|------|------|
| `apps/web/src/styles/index.css` | Token 定义 + 全局组件样式 |
| `apps/web/src/lib/theme.ts` | 主题偏好（含跟随系统）读写、解析与 `data-theme` |
| `apps/web/src/layouts/AppShell.tsx` | 壳层导航字号示例 |
| `apps/web/src/components/ui/*` | Empty / Section 等基础组件 |
| [Docker CI/CD](../ops/ci-cd.md) | 构建与发布 |
| [Source 插件开发](./source-plugin.md) | 插件开发（与 UI token 无关） |

---

## 12. 一句话

> **字号看角色，颜色看语义；只引 token，不写魔法数。**
