---
name: cross-harness-flow
description: 用 chflow 和 Herdr 在 Pi、Codex、Claude Code、Antigravity 之间派发任务、核验回执、处理阻塞和恢复工位。Use for cross-harness delegation, model or effort switching, and task recovery.
compatibility: 'chflow v3, Node.js >=22.13.0; Herdr >=0.9.5 for interactive workflows.'
---

# 跨 Harness 会话协同（v3）

## 派发前确认
- 用户本次指令和工作区文档（如 `AGENTS.md`、`Steering.md`）都未约定时，先询问目标 Harness/模型、可写范围、是否用 worktree 隔离，以及权限档位。缺哪项确认哪项，确认后再派发；`auto-workspace` 或 `yolo` 需明确授权。
- 四档权限：`readonly` 只读；`ask`（默认）保留原生确认；`auto-workspace` 工作区内受控免审；`yolo` 可绕过原生审批和沙箱限制，仅在明确授权或外部隔离下使用。复用旧窗格时，自动按键仅用于已识别的权限弹窗，`auto-workspace` 还会筛查高危命令。
- `agy` 保留有人在场的交互，非前台路由须 `--attended`；禁止 `--unattended`、`--bg`、外层自动/定时重试及作为自动回退目标。无人值守无头任务使用合规的 Codex、Claude 或 Pi 渠道。凭据与真实邮箱留在宿主管理。

## 双轨入口
- 先用 `command -v chflow` 检查；缺失时请用户确认在 `packages/chflow/` 执行 `npm ci && npm run build`，再用 `npm install -g --prefix ~/.local .`（或先 `npm pack` 再 `pnpm add -g --offline ./chflow-3.4.0.tgz`）以用户权限安装。建立 Herdr 工位前，可用 `herdr --skill` 阅读其操作约定。
- CLI `chflow`、可选 Stdio MCP `chflow mcp` 与随 Daemon 常驻的本地控制台 `chflow ui` 共享每用户 Daemon，首次业务操作时懒启动。推荐按项目挂载 MCP：Antigravity `.agents/plugins/` 或 `.agents/plugins.json`；Claude Code `.mcp.json`；Codex `.codex/config.toml` 或 `-c`；Pi `builtin:mcp` + `codemode` 或直接走 CLI。[安装及模板](references/operations.md)

## 派发、回执与核验
1. 用 `chflow health` 检查工位；高频固定分工可用 `chflow role set/bind` 建项目角色并热替换底层 Harness/会话（无需改角色名即可沿用 `--task` 线程），临时工位用 `chflow start` / `chflow switch`，再用 `chflow send <role|worker> --brief-file <path>` 派发。一次性无头任务用 `chflow run`，同步结果用 `chflow wait <task>`；离线窗格自动同步并在无活跃任务时清理，也可用 `chflow prune` 手动整理。
2. 正文经 `.chflow/tasks/<task>/t<N>-brief.md` 和 `t<N>-reply.md` 传递；无有效工作区时采用派发事件指示的回落信箱。唤醒只带来源、收信、权限、状态、文件路径及下一步，通常 3–5 行；批次每项一行。勿将 JSON、屏幕正文或大段结果注入对话。
3. Worker 读取 `brief`、写入 `out` 后执行 `chflow reply <task> --attempt <当前轮次标识> --ok --note '<一句话结论>'`。后续轮次必传当轮 `--attempt`，建议首轮也传；只读 Worker 可加 `--body '<正文>'` 或 `--body -` 由 Daemon 代写。
4. 主 Agent 按需读取 `out` 核验；追问用 `chflow send <worker> --task <task>` 并提供新 brief，确认交付后用 `chflow finish <task> --ok`。
5. `health` / `list --panes` 区分受管和外部在线工位。用 `chflow adopt <pane>` 纳管现有工位；执行中的工位只登记元数据，等空闲再派发。用 `handoff --to <pane>` 主动移交，或获授权后从接管方执行 `adopt --takeover`，控制权与未投递回执一并迁移。
6. Herdr 外部会话可用 `start --resume <会话 ID|last>` 原生迁入；同机外部终端可共享发起端 `CHFLOW_STATE_DIR`，只提交回执。
7. 跨机 `--machine` 走 Herdr。先核实两侧同路径共享信箱及回调至发起端 Daemon 的路径；任一缺失就告知用户只能走控制面，文件传递/回执需另行接管。

## 阻塞与恢复
- 常规只看结构化状态；`blocked` 时 Daemon 至多按该状态序列读屏一次，脱敏快照只留 `diag`。聚焦收件窗格在投递前仅检查底部三行是否有草稿；草稿留在终端。按需查 `chflow inspect <task> --diag`，确需手动读屏时显式 `chflow inspect <task> --screen`。遇需求提问先核对用户授权，未决事项向用户确认。
- 收件窗格忙时排队，空闲后默认约 2 秒合并唤醒；聚焦时遇到打字或草稿会暂缓。用 `chflow inbox` 查看候投回执，或用 `chflow flush` 手动拉取摘要。人工解阻或续跑后，过期告警自动撤回；已恢复执行的任务无需再次 `resume` 或 `retry`。
- 合规非 `agy` 通道默认指数退避 4 次；可以按需加自定义重试队列、额度刷新定时重试和有序回退渠道，派发时无需逐项配置。人工接力用 `chflow resume <task>` 或 `chflow retry <task>`，示例见[操作手册](references/operations.md)。
