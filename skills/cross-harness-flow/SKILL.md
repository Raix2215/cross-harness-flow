---
name: cross-harness-flow
description: 用 chflow 和 Herdr 在 Pi、Codex、Claude Code、Antigravity 之间自动编排全局/项目角色与持久会话、派发任务、核验回执、处理阻塞和恢复工位。Use for cross-harness delegation, autonomous role/session setup, model or effort switching, and task recovery.
compatibility: 'chflow v3.6+, Node.js >=22.13.0; Herdr >=0.9.5 for interactive workflows.'
---

# 跨 Harness 会话协同（v3.6）

## 四层工作流与角色分层
1. **意图编排层**（主控 Agent + 本 Skill）：拆解用户目标，自动推导角色分工、权限与执行形态。
2. **项目与角色层**：高频通用分工存为**全局角色模板**（`~/.config/chflow/roles.yaml`，`chflow role set|list|remove <name> --global`），不自动污染各项目画布；仅在项目内首次 `role bind` 或 `send <role> --spawn` 时**懒实例化**为项目角色。覆盖优先级：**单次派发参数 > 项目角色实例（含 `.chflow/project.yaml`）> 全局角色模板 > Skill 场景默认值**；项目内修改不影响全局，改模板须显式 `--global`。
3. **会话与执行层**：将稳定角色绑定到可热替换的 Herdr 持久窗格或一次性无头 `chflow run`；窗格关闭/退出后角色自动回到 `unbound` 待命。
4. **信箱与控制面**：工作区 `.chflow/` 文件信箱 + 每用户常驻 Daemon + 内置 WebUI / CLI 看板。

## 自主推导与确认边界
- 收到协同目标后，主动执行 `chflow health` 与 `chflow role list --global` 探测可用 Harness、在线工位与已有模板，**直接按场景自动建立或复用角色与会话并派发，无需逐项追问参数**：
  - **代码修改/实现**：Git 仓库默认 `auto-workspace` + `--worktree` 隔离；非 Git 目录直接在当前目录用 `auto-workspace`（可按需用 `--workspace-mode` 指定原生基底）。
  - **代码审查/调研/分析**：默认 `readonly`。
  - **持久 vs 无头分流**：需多轮协作、追问或保持上下文的开发/审查 → 建/复用持久 Herdr 角色窗格（`role set` + `role bind --spawn` / `send --spawn`）；一次性只读核查或独立检索 → 直接走无头 `chflow run`。
- **仅在以下情况先向用户确认**：需要 `yolo`、跨工作区破坏性操作、目标 Harness/渠道缺失或冲突，或工作区 `AGENTS.md`/`Steering.md` 另有约束。
- 五档权限（命令与路径安全由各 Harness 原生策略负责，`chflow` 不维护额外命令黑名单）：
  - `readonly`：只读 / Plan 模式；
  - `ask`：保留原生交互确认；
  - `auto`：**Harness 原生 Auto**（`agy --mode auto` / `claude --permission-mode auto` / `codex --approve-for-me` / `pi` 默认），完全交由目标 Harness 原生自动判断，`chflow` 绝不代按审批键（未以原生 `auto` 启动时提示 `restart_required`）；
  - `auto-workspace`：**工作区自动 + `chflow` 弹窗代审**，可通过 `--workspace-mode` 自选原生启动基底（`agy`/`claude` 默认 `accept-edits`、可选 `auto`；`codex` 默认 `workspace-write`、可选 `approve-for-me`），仅在活跃弹窗区确认属于权限请求且非用户问答时自动放行；
  - `yolo`：原生跳过审批与沙箱 + 无过滤透传（仅跳过用户问答、不安全选项与 3 次循环），仅限明确授权或外部隔离。
- `agy` 仅用于有人在场的交互（非前台路由或提权含 `readonly`/`auto`/`auto-workspace`/`yolo` 须 `--attended`），禁止 `--unattended`、`--bg`、自动/定时重试及自动回退。无人值守无头任务使用合规 Codex / Claude / Pi 渠道。凭据与真实邮箱严禁落盘。

## 双轨入口
- 先检查 `command -v chflow`；缺失时请用户确认在 `packages/chflow/` 执行 `npm ci && npm run build && npm install -g --prefix ~/.local .`（或 `npm pack` 后 `pnpm add -g --offline ./chflow-3.6.3.tgz`）以用户权限安装。建立 Herdr 工位前可用 `herdr --skill` 查阅工位约定。
- CLI `chflow`、可选 Stdio MCP `chflow mcp` 与常驻控制台 `chflow ui` 共享每用户 Daemon，首次业务操作懒启动；可用 `chflow stop` / `chflow quit` 显式停机。项目级 MCP 挂载见[操作手册](references/operations.md)。

## 派发、回执与核验
1. 固定分工优先通过 `chflow role set/bind` 或全局模板懒实例化并用 `chflow send <role> --brief-file <path>`（未绑定时加 `--spawn`）派发，随时 `role bind` 热替换底层 Harness/模型而延续原 `--task`；临时工位用 `chflow start` / `chflow switch`。`chflow health` / `list --panes` 展示可读工位名与 Herdr 位置，离线窗格自动同步清理（或手动 `chflow prune`）。
2. 正文经 `.chflow/tasks/<task>/t<N>-brief.md` 与 `t<N>-reply.md` 传递（无有效工作区时用派发指定的回落信箱）。唤醒只含来源、收信、权限、状态、路径与下一步（3–5 行；批次每项一行），勿把 JSON、屏幕原文或大段结果注入对话。
3. Worker 读 `brief`、写 `out` 后执行 `chflow reply <task> --attempt <当轮标识> --ok --note '<一句话结论>'`；只读 Worker 可加 `--body -` 由 Daemon 代写。主 Agent 核验 `out` 后追问用 `chflow send <role|worker> --task <task>`，结单用 `chflow finish <task> --ok`。
4. 存量在线窗格用 `chflow adopt <pane>` 纳管（忙碌时只登记元数据）；移交控制权及未投递回执用 `handoff --to <pane>` 或授权后 `adopt --takeover`。外部会话用 `start --resume <id|last>` 迁入；跨机 `--machine` 须先核实两侧同路径共享信箱及回调至发起端 Daemon 的通路。

## 阻塞与恢复
- 常规监看零读屏；`blocked` 时每个状态序列自动读屏一次并将脱敏快照写入 `diag`。长耗时 `working` 工位在触发 `stalled` 告警前会自动执行双采样活体复核（`CHFLOW_STALL_CONFIRM_MS`，默认 20 秒），核对末 20 行屏幕哈希与产物/本地会话文件活跃时间戳，消除活跃工位误报。按需查 `chflow inspect <task> --diag`，确需手动读屏才显式 `inspect --screen`。
- 收件窗格忙时入队防抖合并；聚焦时检测到打字静默窗、未提交输入草稿或交互选择阻挡暂缓投递（`deferred_user_typing`），按周期定时重投并在解除后自动防抖合并送达，也可用 `chflow inbox` / `chflow flush` 无侵入查看消费。人工解阻或续跑后旧告警自动撤回。
- 合规非 `agy` 通道默认指数退避 4 次，支持 `--retry-after` / `--at` 定时恢复与 `--fallback` 回退链；人工接力用 `chflow resume <task>` 或 `chflow retry <task>`，详见[操作手册](references/operations.md)。
