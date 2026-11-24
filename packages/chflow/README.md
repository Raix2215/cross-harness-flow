# chflow v3.3.0

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
pnpm add -g --offline ./chflow-3.3.0.tgz
```

For cross-machine offline distribution, copy `chflow-3.3.0.tgz` and run:

```sh
# Linux / Unix
npm install --offline -g --prefix "$HOME/.local" ./chflow-3.3.0.tgz
```

```powershell
# Windows (with a user-writable npm prefix on PATH)
npm install --offline -g .\chflow-3.3.0.tgz
```

## Quick Start

Once routing, working scope, and permissions are agreed:

```sh
chflow health

# Define stable project roles and bind/hot-swap underlying sessions anytime
chflow role set reviewer --kind codex --perm readonly --desc "Diff & security reviewer"
chflow role bind reviewer --spawn
chflow send reviewer --brief-file review-brief.md

# Or spin up an ad-hoc worker pane directly
chflow start worker-1 --kind codex --place split --perm readonly
chflow send worker-1 --brief-file task-brief.md
```

Use `chflow health`, `chflow status`, or `chflow list --panes` to view live projects, roles, managed panes, and unmanaged agents. Herdr `agent list` is treated as the live source of truth: closed panes without active tasks are auto-pruned, closed panes bound to a role revert to `unbound` standby, and `chflow prune [--tasks]` cleans up stale entries on demand.

`chflow adopt <pane> --name <alias>` registers an existing pane; `chflow handoff <pane_or_task> --to <pane>` transfers ownership and queued receipts; `chflow start <alias> --kind <kind> --resume <id|last>` migrates an external native session into Herdr.

Workers read the brief path from the dispatch and reply with `chflow reply <task> --attempt <attempt> --ok --note '<summary>'`; `--body -` lets a read-only Worker stream its result to the Daemon. Follow-up turns require the current `--attempt`. The controller verifies the output file and closes the task with `chflow finish <task> --ok`.

## Embedded WebUI, CLI Dashboard & MCP

- **Embedded WebUI**: Starts automatically with the Daemon on `http://127.0.0.1:4317` (falling back to a free port on conflict). Supports multi-project / multi-controller switching, interactive role-first topology canvas (pan/zoom/click/context menu), role creation/hot-swapping, and one-click operator actions.
  - Run `chflow` in an interactive terminal for live status + WebUI URL, `chflow top` for an in-place live dashboard, `chflow open` (or `chflow ui --open`) to open the browser, and `approve` / `perm` / `queue` / `view` for quick human TTY overrides.
  - For LAN / Tailnet remote access, run a standalone instance with `chflow ui --host 0.0.0.0 --allow-remote`, or stop the Daemon (`chflow daemon stop`, after confirming no active tasks) and restart it with `CHFLOW_UI_HOST=0.0.0.0 CHFLOW_UI_ALLOW_REMOTE=1` to enforce Access Token + `HttpOnly` cookie auth. Note that `?token=...` links are reusable credentials — do not share them publicly.
- **Project-scoped MCP**: Configure your host to run `chflow mcp` over stdio. It shares the same Daemon, exposes **19 compact tools** by default (including `flow_role`), and keeps `flow_respond` opt-in.

## Architecture & Guarantees

The CLI, MCP server, and embedded WebUI are thin clients to a lazily started, per-user Daemon backed by SQLite and workspace `.chflow/` mailboxes (with fallback mailbox when no writable workspace exists). Herdr carries short control signals while the Daemon handles live reconciliation, coalesced notifications, typing-aware delivery deferral (`chflow inbox` / `chflow flush`), and retry/fallback scheduling.

`--machine` routes Herdr operations over SSH; cross-host file exchange requires a shared mounted mailbox and Worker callback connectivity to the owning Daemon. Antigravity (`agy`) is strictly attended-only (`--attended`) and excluded from unattended runs, automatic retries, and automatic fallbacks.

## Development

Run `npm run build` to compile to `dist/`, `npm run test:e2e` for the full black-box E2E suite, and `npm run pack:check` for the offline npm tarball verification (including `LICENSE`).
