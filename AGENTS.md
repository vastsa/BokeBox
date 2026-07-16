# Agent 工作约定

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
4. 使用 HEREDOC 提交（`git commit -m "$(cat <<'\''EOF'\''" ...`）
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
