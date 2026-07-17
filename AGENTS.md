# Agent 工作约定

## 开源协议与归属信息（强制）

本项目采用 **LGPL-3.0**（`LGPL-3.0-only`）开源协议，见根目录 `LICENSE` 与 `package.json`。

### 必须遵守

- 保留并尊重 **LGPL-3.0** 协议声明
- 保留仓库地址与相关归属信息，包括但不限于：
  - `https://github.com/vastsa/BokeBox`
  - `https://github.com/vastsa/BokeBox.git`
  - `github.com/vastsa/BokeBox`
  - README / package.json / 文档中的 `repository`、`homepage`、`bugs`、License Badge、项目主页链接
  - `LICENSE` 文件本身及对 LGPL 的引用说明

### 明确禁止

- **禁止** 删除、清空、替换或弱化仓库地址
- **禁止** 移除、改写或绕过 LGPL 协议声明与相关版权/归属信息
- **禁止** 将协议擅自改为其他 License
- **禁止** 在重构、清理文档、生成代码、脱敏或“精简文案”时顺手去掉上述信息

若用户明确要求修改协议或仓库地址，**先提示本项目为 LGPL-3.0 且需保留仓库与协议信息**，未经明确授权不得执行删除/替换。

---

## Git 提交规范（强制）

**每次完成一个任务后，必须进行规范提交**，不要等用户提醒。

### 执行时机

- 功能开发 / 修 bug / 重构 / 文档更新等阶段性工作完成后
- 确认改动可工作、无明显半成品后再提交
- 用户明确说「先别提交」时除外

### 提交流程

1. 并行查看：`git status`、`git diff`、`git log`（了解风格）
2. 起草简洁 commit message（说明为什么，而非堆砌文件列表）
3. 只 stage 相关文件，避免把 `.env`、媒体产物、构建缓存误入仓
4. 使用 HEREDOC 提交（`git commit -m "$(cat <<'EOF'" ...`）
5. 提交后执行 `git status` 确认干净或仅剩无关改动
6. **默认不 push**，除非用户明确要求

### Message 风格

- 优先 Conventional Commits：`feat` / `fix` / `refactor` / `docs` / `chore` …
- 使用简体中文或中英混排，一句说清变更意图
- 相关改动可同一次提交；无关改动拆开

### 禁止

- 不修改 git config
- 不提交密钥、`.env`、数据库、任务媒体、大体积截图
- 不使用 `--no-verify` 绕过钩子（除非用户明确要求且理由充分）
- 不 force push 到 main/master

## Git Worktree 开发约定（强制）

功能开发、重构、实验性改动 **必须在独立 git worktree + 分支** 中进行，完成并验证后再合并回主工作区。

### 必须遵守

- 不要在主工作区 `main` 上直接堆长期功能开发
- 每个任务使用独立 worktree，例如：
  - `git worktree add -b feat/<name> ../person-boke-<name> main`
- 在 worktree 内完成实现、自检、提交
- 确认可工作后再合并回主仓对应分支
- 合并后清理 worktree：`git worktree remove <path>`

### 禁止

- 在主工作区与多个任务改动混杂推进
- 未验证就直接在 main 上大范围修改

