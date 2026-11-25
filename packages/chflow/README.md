# chflow v3.5.0

`chflow` coordinates Pi, Codex, Claude Code, and Antigravity sessions across multiple projects and stable roles. It requires Node.js **22.13.0+** and has **zero third-party runtime dependencies**.

- **Interactive multi-pane orchestration** (`start`, `adopt`, `handoff`, `send`, `switch`, `respond`, `role bind --spawn`) requires **[Herdr](https://github.com/herdrdev/herdr) >= 0.9.5** and the target Harness CLI on `PATH`.
- **Headless runs & control plane** (`run`, Daemon, SQLite state, `.chflow/` mailbox, embedded WebUI) run standalone with only Node.js and the target Harness CLI (`codex`, `claude`, or `pi`).

## Install

From `packages/chflow/` in the source workspace, install with user permissions:

```sh
npm ci
npm run build
npm install -g --prefix "$HOME/.local" .
```

Put `$HOME/.local/bin` on `PATH`. With pnpm (including pnpm 12+), pack first and install offline:

```sh
npm pack
pnpm add -g --offline ./chflow-3.5.0.tgz
```

For cross-machine offline distribution, copy `chflow-3.5.0.tgz` and run:

```sh
# Linux / Unix
npm install --offline -g --prefix "$HOME/.local" ./chflow-3.5.0.tgz
```

```powershell
# Windows (with a user-writable npm prefix on PATH)
npm install --offline -g .\chflow-3.5.0.tgz
```

## Quick Start

```sh
chflow health

# Define reusable global role templates (~/.config/chflow/roles.yaml, zero credentials)
chflow role set reviewer --global --kind claude --perm readonly --desc "Cross-harness diff & security reviewer"
chflow role list --global

# Lazily instantiate global templates or define project-specific roles and hot-swap sessions anytime
chflow role set backend --kind codex --perm auto-workspace --worktree --desc "Backend implementation & tests"
chflow role bind backend --spawn
chflow send reviewer --spawn --brief-file review-brief.md

# Or spin up an ad-hoc worker pane directly
chflow start worker-1 --kind codex --place split --perm readonly
chflow send worker-1 --brief-file task-brief.md
```

Global role templates live in `$XDG_CONFIG_HOME/chflow/roles.yaml` (override via `CHFLOW_CONFIG_DIR`) and do not clutter projects until first bound/dispatched (`role bind` or `send --spawn`). Override precedence: **per-dispatch flags > project role instance (incl. `.chflow/project.yaml`) > global role template > Skill defaults**.

Use `chflow health`, `chflow status`, or `chflow list --panes` to view live projects, roles, managed panes, and unmanaged agents with human-readable Herdr `workspace / tab` locations and `folder · Harness` names (raw pane IDs stay available as secondary technical identifiers). Herdr `agent list` is treated as the live source of truth (including exited agent sessions whose Herdr pane remains open): exited/closed panes without active tasks are auto-pruned, role bindings revert to `unbound` standby, and `chflow prune [--tasks]` cleans up stale entries on demand.

Explicit Daemon shutdown is available via `chflow stop` / `chflow quit` (pass `--force` when active tasks exist), WebUI topbar "Stop Service", or `x` (twice) in `chflow top`. Idle Daemons auto-exit after `CHFLOW_IDLE_TIMEOUT_SEC` (default 1800s with no clients) or `CHFLOW_UI_IDLE_TIMEOUT_SEC` (default 3600s when only passive WebUI tabs remain with zero live sessions or active tasks).

`chflow adopt <pane> --name <alias>` registers an existing pane; `chflow handoff <pane_or_task> --to <pane>` transfers ownership and queued receipts; `chflow start <alias> --kind <kind> --resume <id|last>` migrates an external native session into Herdr.

Workers read the brief path from the dispatch and reply with `chflow reply <task> --attempt <attempt> --ok --note '<summary>'`; `--body -` lets a read-only Worker stream its result to the Daemon. Follow-up turns require the current `--attempt`. The controller verifies the output file and closes the task with `chflow finish <task> --ok`.

## Embedded WebUI, CLI Dashboard & MCP

- **Embedded WebUI**: Starts automatically with the Daemon on `http://127.0.0.1:4317` (falling back to a free port on conflict). Supports multi-project / multi-controller switching, interactive role-first DAG canvas & card views, human-readable Herdr session names & `Workspace / Tab` subtitles, one-click **Focus in Herdr** (`herdr agent focus`), global template fill/save in the New Role modal, session hot-swapping, and one-click operator actions.
  - Run `chflow` in an interactive terminal for live status + WebUI URL, `chflow top` for an in-place live dashboard, `chflow open` (or `chflow ui --open`) to open the browser, and `approve` / `perm` / `queue` / `view` for quick human TTY overrides.
  - For LAN / Tailnet remote access, run a standalone instance with `chflow ui --host 0.0.0.0 --allow-remote`, or stop the Daemon (`chflow daemon stop`, after confirming no active tasks) and restart it with `CHFLOW_UI_HOST=0.0.0.0 CHFLOW_UI_ALLOW_REMOTE=1` to enforce Access Token + `HttpOnly` cookie auth. Note that `?token=...` links are reusable credentials — do not share them publicly.
- **Project-scoped MCP**: Configure your host to run `chflow mcp` over stdio. It shares the same Daemon, exposes **19 compact tools** by default (including `flow_role` with `--global` template support), and keeps `flow_respond` opt-in.

## Architecture & Guarantees

The CLI, MCP server, and embedded WebUI are thin clients to a lazily started, per-user Daemon backed by SQLite, global role templates (`~/.config/chflow/roles.yaml`), and workspace `.chflow/` mailboxes (with fallback mailbox when no writable workspace exists). Herdr carries short control signals while the Daemon handles live reconciliation, coalesced notifications, typing-aware delivery deferral (`chflow inbox` / `chflow flush`), and retry/fallback scheduling.

`--machine` routes Herdr operations over SSH; cross-host file exchange requires a shared mounted mailbox and Worker callback connectivity to the owning Daemon. Antigravity (`agy`) is strictly attended-only (`--attended`) and excluded from unattended runs, automatic retries, and automatic fallbacks.

## Development

Run `npm run build` to compile to `dist/`, `npm run test:e2e` for the full black-box E2E suite, and `npm run pack:check` for the offline npm tarball verification (including `LICENSE`).
