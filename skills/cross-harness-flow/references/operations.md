# chflow v3 操作手册

## 安装与离线分发

运行环境为 Node.js **22.13.0+**。交互协同需要 Herdr **0.9.5+**、可用的 Harness CLI 以及 Herdr 工位；无头任务还需对应的 `codex`、`claude` 或 `pi` 命令。Skill ZIP 只分发文档，`chflow` 单独安装。

在源码根目录执行：

```sh
cd packages/chflow
npm ci
npm run build
npm install -g --prefix "$HOME/.local" .
```

将 `$HOME/.local/bin` 加入 `PATH`。使用 pnpm 且已配置用户级全局目录时，也可在构建后先运行 `npm pack`，再执行 `pnpm add -g --offline ./chflow-3.3.0.tgz`，并确认 pnpm 全局 bin 目录在 `PATH` 内。先征得用户同意再安装，整个过程使用用户权限。

跨机离线分发：开发机先在 `packages/chflow/` 运行 `npm run build && npm pack`，将 `chflow-3.3.0.tgz` 复制到目标机。目标机已有 Node.js 时可直接安装，包无第三方运行时依赖：

```sh
# Linux：任选一种用户级安装方式
npm install --offline -g --prefix "$HOME/.local" ./chflow-3.3.0.tgz
pnpm add -g --offline ./chflow-3.3.0.tgz
```

```powershell
# Windows：使用可写的用户 npm prefix，并让其位于 PATH
npm install --offline -g .\chflow-3.3.0.tgz
```

安装完成后，在实际运行 CLI 或启动 MCP 的环境检查 `command -v chflow`（PowerShell：`Get-Command chflow`），再执行 `chflow health`。从 v2 切换时，将项目 MCP 入口改为 `chflow mcp`，在 v3 新建任务；历史 v2 工位和状态单独处理。

## 首轮派发与追问

示例采用已获用户或工作区文档授权的 Codex 只读审查工位。在 Herdr pane 内先用 `herdr --skill` 查阅工位约定：

```sh
chflow health
chflow start review --kind codex --place split --perm readonly
chflow send review --brief-file review-brief.md
chflow wait <task> --timeout 120
```

尖括号为输出中取得的实际值。`send` 会写入 `.chflow/tasks/<task>/t1-brief.md` 并注入精简派发文本。Git 工作区（含 worktree）使用本地 `info/exclude` 忽略 `.chflow/`；缺少有效可写工作区时，以派发文本给出的 Daemon 回落信箱路径为准。Worker 读取 `brief` 后按 `out` 交付。只读 Worker 可通过 CLI 让 Daemon 代写：

```sh
printf '%s\n' '审查结果正文' | chflow reply <task> --attempt <attempt> --ok --note '审查完成' --body -
```

可写 Worker 先将正文写到指定 `out`，再执行同一回执命令（省略 `--body -`），也可用 `--out <path>` 指定已有文件。Pi 的 `readonly` 工位只保留读工具，禁用 MCP 和 shell；派发前约定由主 Agent 或人工将 Worker 给出的正文用 `--body` 登记。`attempt` 使用派发事件给出的当前标识；Daemon 接受唯一的前 12 位或完整 32 位标识。追问时 `chflow send review --task <task> --brief-file followup.md` 沿用任务号并推进轮次，后续各轮的 `reply` 必须传该轮 `--attempt`。主 Agent 读取 `out` 核验后执行 `chflow finish <task> --ok`。

### 跨机前提

`chflow start ... --machine <Herdr-profile>` 和 `chflow send ... --machine <Herdr-profile>` 把工位操作送往 Herdr 的 SSH 路由。派发前验证 Herdr 目标、两侧均已安装 `chflow`，再核实：

1. 两侧用同一绝对路径访问共享挂载上的工作区和信箱；核对挂载身份、目录和文件权限（Daemon 新建信箱目录为 `0700`，正文为 `0600`）。发起端 Daemon 可写，Worker 能读取，写入按任务权限执行。发起端私有状态目录内的回落信箱通常只在本机可用。
2. 远端 Worker 有经授权的回程，能调用发起任务的同一用户、同一 `CHFLOW_STATE_DIR` 的 Daemon。比如双方已配置可信 SSH 时，可通过它在发起主机以任务所有者身份执行 `chflow reply <task> --attempt <attempt> --ok ...`。远端直接执行 `chflow reply` 默认连接远端本地 Daemon，该 Daemon 没有发起端任务。

Herdr 路由只覆盖终端控制面。若缺共享挂载或回程，向用户说明文件交接或自动回执需要另行接管，选择同机工位或事先约定的人工交接。禁止把私有 Daemon 状态和凭据作为共享信箱内容。

## 纳管、移交和原会话迁入

`chflow health` 或 `chflow list --panes` 区分 `managed_panes` 与 `unmanaged_live_agents`。`chflow adopt <pane> --name <alias>` 只登记工位身份和控制方，支持 `working`、`idle` 和 `done`。第一次派发附 `mode=adopted`；Worker 以本轮 brief 为边界。纳管前的原生权限为 `unknown`，需要修改启动参数时，待工位空闲后执行 `chflow switch <alias> --perm <tier> --restart`。

在旧控制方会话执行 `chflow handoff <pane_or_task> --to <new_pane>`；可指定 `--to-machine` 或 `--to-session`，`--notify-old` 会向原控制方排队发送单行提示。在新控制方会话执行 `chflow adopt <pane> --takeover` 也能显式接管。控制方及待投递消息一并改路由；若消息正在投递，待投递提交完成后再移交。其他会话的普通 `adopt`、`send` 和 `switch` 会返回 `pane_owned_by_other`；旧控制方退出后可重新接管。

普通终端和 tmux 中的会话用 `chflow start <alias> --kind <kind> --resume <id|last>` 迁入 Herdr。Codex 原生恢复用 ID 或 `--last`，Claude 用 `--resume` 或 `--continue`，Pi 用 JSONL 路径或 `-c`，Antigravity 用 `--conversation` 或 `--continue`（遵循在场规则）。Herdr 只能向其托管的工位注入提示和查询状态；同机外部终端可共享发起端 `CHFLOW_STATE_DIR`，用 `chflow reply` 单向回执。

## CLI 速查

`chflow --help` 和 `chflow <command> --help` 查看参数；脚本可用 `--json`，Agent 间传递仍用纯文本路由和文件路径。

| 命令 | 用法 |
| --- | --- |
| `daemon start\|stop\|status\|logs` | 管理当前用户 Daemon；一般由业务命令懒启动，查询 `status` 或 `stop` 本身保持停机状态。 |
| `role list\|set\|bind\|unbind\|remove` | 管理项目稳定角色（如 `backend`、`reviewer`）并热替换底层 Harness/窗格/无头配置；绑定关闭的窗格后自动回到 `unbound` 待命，可在 `.chflow/project.yaml` 声明项目预设。 |
| `prune [--tasks] [--project ID]` | 清理 Herdr 中已关闭且无活跃任务的离线窗格记录；加 `--tasks` 一并归档清理已终结的历史任务。 |
| `start [name] --kind codex\|claude\|pi\|agy` | 建交互工位；用 `--resume <id\|last>` 恢复已有会话，可选 `--role <role>` 与 `--project <id>`。用 `--place pane\|split\|tab\|workspace` 布局，`--worktree <branch>` 隔离变更（使用 `workspace` 布局），`--session <name>` 指定 Herdr session，`--machine <profile>` 跨机。按工位能力传 `--model`、`--effort`、Pi `--provider` 或 `--perm`。 |
| `adopt <pane> [--name ALIAS] [--takeover]` | 纳管已在线工位，按需指定 `--role`、`--project`、`--perm` 或 `--controller <pane>`；显式接管会带走未投递回执。 |
| `handoff <pane_or_task> --to <new_pane>` | 移交控制权及排队回执；可传 `--to-machine` / `--to-session` 和 `--notify-old`。 |
| `switch <target>` | 切换工位模型、effort、provider 或权限；涉及会话重启时先核对现场，再按需用 `--restart`。 |
| `send <role\|target>` | 用 `--brief <text>` 或 `--brief-file <path>` 派发；优先按当前项目角色名解析，未绑定角色默认拦截（显式 `--spawn` 可按预设拉起）。`--task <id>` 追问，`--watch` 监看或 `--wait` 同步等待，`--perm` 显式覆盖权限。 |
| `reply <task>` | Worker 用 `--attempt <id>` 和 `--ok` / `--fail` / `--question` / `--progress` 回执；`--note <text>` 为一句话摘要，正文用 `--out` 或 `--body`。 |
| `wait <target_or_task> [--timeout S]` | 等待任务或工位推进。 |
| `watch <task>` | 把已有活跃任务纳入 Daemon 监看。 |
| `run --kind codex\|claude\|pi` | 用 `--brief` / `--brief-file` 执行一次性任务；`--transport exec\|print\|rpc` 按 Harness 选择，`--bg` 异步执行。 |
| `respond <task> --expect-visible <substr>` | 针对明确授权的阻塞项受控按键或输入；按需用 `--key`、`--text`、`--submit-key`。 |
| `inspect <task>` | 查看信箱路径和状态；`--diag` 找诊断，主动用 `--screen [--lines N]` 才读屏。 |
| `resume <task> [--brief TEXT]` | 从保存的会话续跑。 |
| `retry <task>` | 立即重试，或用 `--at` / `--after` 定时；`--switch` 显式换渠道接力。 |
| `finish <task> --ok\|--fail` | 核验后结单，按需附 `--note` 和 `--attempt`。 |
| `cancel <task> [--close-pane] [--reconcile]` | 取消任务、队列与重试计划；可关窗或核对未知关窗状态。 |
| `list [--all] [--panes] [--project ID]` | 查看任务、待投递队列、重试计划、项目角色和受管/未纳管窗格（支持按 `--project` 筛选）。 |
| `inbox [pane]` | 查看当前或指定窗格的排队回执，含 `deferred_user_typing`。 |
| `flush [pane]` | 拉取该窗格回执的合并摘要并标记已消费，保留当前输入草稿。 |
| `health [target_or_task]` | 以 Herdr 实时在线窗格为真值检查 Daemon、Herdr、项目、角色、工位和任务状态。 |
| `status [-w] [--project ID]` / `top` | 展示彩色紧凑全局状态（含多项目摘要、角色表与内置 WebUI 链接）；`top` 或 `status -w` 进入基于 Daemon 推送的零读屏实时看板（支持 `q/o/a/p/f/r` 热键）。 |
| `ui [--open]` / `open` | 打印或直接打开 Daemon 内置常驻 Web 控制台（默认 `127.0.0.1:4317`，冲突自动回退）；传 `--port`/`--host`/`--session`/`--machine` 可另起独立实例，非回环开放需 `--allow-remote` 并自动启用访问令牌鉴权（若要切换常驻 Daemon 的远程监听参数，先在确认无进行中任务后执行 `chflow daemon stop`，再以 `CHFLOW_UI_HOST`/`CHFLOW_UI_ALLOW_REMOTE=1` 重启；带 `?token=` 的链接属于可复用登录凭据，请勿公开分享）。 |
| `approve` / `perm` / `queue` / `view` | 面向人类交互终端的快捷接管指令（不进 MCP）：一键放行阻塞、热切权限、暂停/强推/清理投递队列、以及只读查阅任务信箱（`brief`/`reply`/`diag`）。 |
| `mcp [--enable-respond\|--no-respond]` | 启动 Stdio MCP 薄代理，复用同一 Daemon。 |

退出码：`0` 成功；`1` 运行错误、合规拦截或身份漂移；`2` 阻塞或回执待送达；`3` 等待超时；`64` CLI 语法错误；`130` / `143` 对应信号中断。

## 项目或文件夹级 MCP

推荐只为高频协作项目配置 MCP，由宿主通过 `PATH` 找到 `chflow`。合并模板到配置的现有内容，并按宿主要求信任项目。默认 **19 个核心工具**，含 `flow_role`、`flow_adopt`、`flow_handoff`、`flow_inbox` 和 `flow_flush`。`flow_respond` 默认隐藏；仅在确需且已确认权限策略时加 `--enable-respond` 或 `CHFLOW_MCP_ENABLE_RESPOND=1`；`--no-respond` 或 `CHFLOW_MCP_DISABLE_RESPOND=1` 优先强制关闭。

### Claude Code / Antigravity

Claude Code 在项目 `<project>/.mcp.json` 使用下列 JSON；Antigravity 把同一内容放在 `<project>/.agents/plugins/cross-harness-flow/mcp_config.json`：

```json
{
  "mcpServers": {
    "cross-harness-flow": { "command": "chflow", "args": ["mcp"] }
  }
}
```

Antigravity 插件目录还需 `<project>/.agents/plugins/cross-harness-flow/plugin.json`：

```json
{ "name": "cross-harness-flow" }
```

若受信任的共享插件已位于 `~/.agents/plugins/`，也可仅在项目写 `<project>/.agents/plugins.json`：

```json
{
  "entries": [
    { "path": "~/.agents/plugins", "include_only": ["cross-harness-flow"] }
  ]
}
```

### Codex

在受信任项目的 `<project>/.codex/config.toml` 使用：

```toml
[mcp_servers.cross_harness_flow]
command = "chflow"
args = ["mcp"]
```

单次会话：`codex -c 'mcp_servers.cross_harness_flow={command="chflow",args=["mcp"]}'`。

### Pi

启用内置 `builtin:mcp`，在受信任项目的 `<project>/.pi/mcp.json` 配置项目端点，由 `codemode` 按需发现工具。仅需偶尔派发时直接走 CLI：

```json
{
  "mcpServers": {
    "cross-harness-flow": {
      "command": "chflow",
      "args": ["mcp"],
      "exposure": "codemode"
    }
  }
}
```

等价项目注册命令：`pi mcp add --local cross-harness-flow -- chflow mcp`。交互中用 `/mcp` 核对连通状态。若启用 Pi 的工具内联预算，可在项目 `.pi/settings.json` 合并 `{"codemode":{"inlineBudget":0}}`。

## 权限、阻塞与队列

| `--perm` | 含义 |
| --- | --- |
| `readonly` | 只读，`--readonly` 为简写；与提权透传参数互斥。 |
| `ask` | 默认档位；保留 Harness 的原生确认。 |
| `auto-workspace` | 优先使用 Harness 原生的工作区级权限策略；复用窗格时，仅在确认弹窗属于普通权限请求并通过高危筛查后自动操作。 |
| `yolo` | 可绕过原生审批和沙箱限制；仅在明确授权或外部隔离下使用。复用窗格时只处理已识别的权限弹窗。 |

`auto-workspace` 拒绝自动批准高危操作，例如系统级删除、磁盘操作、`git push --force`、`sudo`、访问 `.env` 或 `~/.ssh/`，以及明显越界的破坏性写删。提问或未知弹窗留给主 Agent 和用户。`respond` 会重新核对状态序列和可见文本；若已由人工放行，返回 `already_unblocked`，保持终端原样。凭据、会话令牌与真实邮箱留在宿主管理，禁止写入任务和 MCP 配置。

`agy` 只用于有人在场的交互，推荐显式加 `--attended`，非前台路由或使用 `readonly` / `auto-workspace` / `yolo` 时必须提供；禁止 `--unattended`、`--bg`、外层自动/定时重试以及作为自动回退目标。无头自动任务使用合规的 Codex、Claude 或 Pi 渠道。

收件窗格忙时先入队；空闲后默认等待约 2 秒再合并有效事件，一批只送一次。完成回执覆盖同一轮较早的进度或阻塞事件；人工解阻后撤回尚未送达的旧告警。常规监看只查结构化状态；Worker 转入 `blocked` 时每个状态序列自动读屏一次，将脱敏后的快照留在 `diag` 文件。按需显式 `inspect <task> --screen`，屏幕原文禁止进入派发或唤醒文本。

聚焦的收件窗格另有打字静默窗（`CHFLOW_TYPING_QUIET_MS`，默认 `2500` 毫秒）。投递前 Daemon 只检查终端底部三行的草稿状态，草稿既不落盘也不进入上下文。检测到打字或未提交草稿时，回执标为 `deferred_user_typing`，并发桌面通知。清空草稿后自动送达；也可用 `chflow inbox [pane]` 查看，再用 `chflow flush [pane]` 拉取摘要并消费，不向输入框注入文字。

## 重试、定时恢复和回退

非 `agy` 业务中断默认按 `5s → 15s → 45s → 120s` 退避重试 4 次，优先复用原会话；无需每次派发都配置。可用 `--max-retries 0` 关闭业务自动重试。Herdr/SSH 瞬断有独立控制面退避。以下为常用覆盖：

```sh
# 定制业务重试队列
chflow send review --brief-file review-brief.md --max-retries 2 --retry-backoff 10,30
# 额度恢复后再跑：派发时先约定，或发现额度耗尽后再计划
chflow send review --brief-file review-brief.md --retry-after 30m
chflow retry <task> --after 30m
chflow retry <task> --at 2026-11-23T20:00:00+08:00
# 用已授权且已安装的模型按序接力；按本机配置填写实际模型名
chflow send review --brief-file review-brief.md --fallback 'claude::sonnet:medium,pi:provider/model:high'
# 人工续跑原会话，或明确只切一个渠道
chflow resume <task>
chflow retry <task> --switch 'claude::sonnet:medium'
```

配置回退链后，额度耗尽可直接切下一候选；一般执行故障在耗尽退避次数后切换。新 Worker 使用原 brief 和可用局部产物。定时计划由 SQLite 持久化，Daemon 重启后恢复；用 `chflow list` 核对计划，`chflow cancel <task>` 撤销计划和待投递事件。实际重试和中断告警出队前会重新核对 Worker 与回执文件；人工续跑后，旧计划和告警会以 `superseded_by_human_resume` 撤回。对已经恢复为 `working` 的 Worker 执行 `resume` 或 `retry`，返回 `already_running_resumed_by_human`。

## 排障顺序

1. **命令不可用**：核对 Node 版本、用户级 npm `bin`、Herdr 版本及宿主环境的 `PATH`；MCP 和终端需使用同一安装。
2. **Daemon 或工位异常**：先看 `chflow daemon status` / `chflow daemon logs`，再用 `chflow health <target_or_task>`。默认状态目录为 `~/.local/state/chflow`；用相同 `CHFLOW_STATE_DIR` 保证 CLI 和 MCP 连接同一实例。
3. **收不到回执**：用 `chflow list --all` / `chflow inspect <task>` 查忙碌、待投递或轮次淘汰，并核对 `out` 路径、当前 `attempt` 与归属 Daemon。跨机先验证挂载和回程，单独检查 Herdr SSH 路由。
4. **任务阻塞**：先查 `chflow inspect <task> --diag`；明确授权后才 `respond` 或请用户接管。若阻塞已消失，避免重复发送按键。
5. **工位中断**：按状态选 `resume` 或 `retry`；`wait` 超时后先查任务再决定，避免重复派发。若发生 `close_unknown` 或原关窗所有者已消失，核对窗格后用 `cancel <task> --reconcile`，仅在确需关闭时加 `--close-pane`。
